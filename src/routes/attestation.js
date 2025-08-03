/**
 * @file attestation.js
 * @brief Attestation management REST API endpoints
 * 
 * This module implements REST API endpoints for device attestation reporting,
 * verification, and policy management in the PQC-Edge-Attestor system.
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Device, AttestationReport } = require('../models');
const { authenticateToken, requireRole, authenticateDevice } = require('../middleware/auth');
const { validateAttestationReport } = require('../validators/attestationValidator');
const { logSecurityEvent } = require('../utils/securityLogger');
const { verifyPQCSignature } = require('../utils/cryptoUtils');
const winston = require('winston');

const router = express.Router();

// Create logger for this module
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'attestation-api' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Rate limiting for attestation endpoints
const attestationRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 requests per windowMs
    message: {
        error: 'Too many attestation requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Stricter rate limiting for report submission
const reportSubmissionLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // limit each device to 5 reports per minute
    keyGenerator: (req) => {
        // Use device ID if authenticated, otherwise IP
        return req.device?.id || req.ip;
    },
    message: {
        error: 'Too many attestation reports submitted, please wait before submitting again',
        code: 'REPORT_RATE_LIMIT_EXCEEDED'
    }
});

router.use(attestationRateLimit);

/**
 * @route GET /api/v1/attestation/reports
 * @desc Get attestation reports with filtering and pagination
 * @access Private
 */
router.get('/reports',
    authenticateToken,
    [
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('deviceId').optional().isUUID().withMessage('Device ID must be a valid UUID'),
        query('verificationStatus').optional().isIn(['pending', 'verified', 'failed', 'expired']),
        query('trustLevel').optional().isIn(['unknown', 'low', 'medium', 'high', 'critical']),
        query('complianceStatus').optional().isIn(['compliant', 'non_compliant', 'warning', 'unknown']),
        query('since').optional().isISO8601().withMessage('Since must be a valid ISO8601 date'),
        query('until').optional().isISO8601().withMessage('Until must be a valid ISO8601 date')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            // Extract query parameters
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;

            // Build where clause for filtering
            const whereClause = {};
            const { Op } = require('sequelize');

            if (req.query.deviceId) {
                whereClause.deviceId = req.query.deviceId;
            }

            if (req.query.verificationStatus) {
                whereClause.verificationStatus = req.query.verificationStatus;
            }

            if (req.query.trustLevel) {
                whereClause.trustLevel = req.query.trustLevel;
            }

            if (req.query.complianceStatus) {
                whereClause.complianceStatus = req.query.complianceStatus;
            }

            // Date range filtering
            if (req.query.since || req.query.until) {
                whereClause.reportTimestamp = {};
                if (req.query.since) {
                    whereClause.reportTimestamp[Op.gte] = new Date(req.query.since);
                }
                if (req.query.until) {
                    whereClause.reportTimestamp[Op.lte] = new Date(req.query.until);
                }
            }

            // Execute query with pagination
            const { count, rows: reports } = await AttestationReport.findAndCountAll({
                where: whereClause,
                limit,
                offset,
                order: [['reportTimestamp', 'DESC']],
                include: [
                    {
                        model: Device,
                        as: 'device',
                        attributes: ['id', 'serialNumber', 'deviceType', 'status', 'trustLevel']
                    }
                ]
            });

            // Calculate pagination metadata
            const totalPages = Math.ceil(count / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            logger.info('Attestation reports retrieved successfully', {
                count: reports.length,
                total: count,
                page,
                filters: Object.keys(whereClause),
                userId: req.user.id
            });

            res.json({
                success: true,
                data: {
                    reports: reports.map(report => report.toEnrichedJSON()),
                    pagination: {
                        page,
                        limit,
                        total: count,
                        totalPages,
                        hasNextPage,
                        hasPrevPage
                    }
                }
            });

        } catch (error) {
            logger.error('Failed to retrieve attestation reports', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to retrieve attestation reports'
            });
        }
    }
);

/**
 * @route GET /api/v1/attestation/reports/:id
 * @desc Get a specific attestation report by ID
 * @access Private
 */
router.get('/reports/:id',
    authenticateToken,
    [
        param('id').isUUID().withMessage('Report ID must be a valid UUID')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const report = await AttestationReport.findByPk(req.params.id, {
                include: [
                    {
                        model: Device,
                        as: 'device',
                        attributes: ['id', 'serialNumber', 'deviceType', 'status', 'trustLevel']
                    }
                ]
            });

            if (!report) {
                return res.status(404).json({
                    error: 'Report not found',
                    message: `Attestation report with ID ${req.params.id} does not exist`
                });
            }

            logger.info('Attestation report retrieved successfully', {
                reportId: report.id,
                deviceId: report.deviceId,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: {
                    report: report.toEnrichedJSON()
                }
            });

        } catch (error) {
            logger.error('Failed to retrieve attestation report', {
                error: error.message,
                reportId: req.params.id,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to retrieve attestation report'
            });
        }
    }
);

/**
 * @route POST /api/v1/attestation/reports
 * @desc Submit a new attestation report from a device
 * @access Device (requires device authentication)
 */
router.post('/reports',
    reportSubmissionLimit,
    authenticateDevice,
    [
        body('reportVersion').optional().isInt({ min: 1 }).withMessage('Report version must be a positive integer'),
        body('pcrValues').isObject().withMessage('PCR values must be an object'),
        body('measurements').isArray().withMessage('Measurements must be an array'),
        body('signature').isBase64().withMessage('Signature must be base64 encoded'),
        body('signatureAlgorithm').isIn(['dilithium2', 'dilithium3', 'dilithium5', 'falcon512', 'falcon1024']).withMessage('Invalid signature algorithm'),
        body('networkInfo').optional().isObject(),
        body('environmentInfo').optional().isObject()
    ],
    validateAttestationReport,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const device = req.device; // Set by authenticateDevice middleware

            // Check if device is active and attestation is enabled
            if (device.status !== 'active' && device.status !== 'provisioning') {
                return res.status(403).json({
                    error: 'Device not active',
                    message: 'Only active devices can submit attestation reports'
                });
            }

            if (!device.attestationEnabled) {
                return res.status(403).json({
                    error: 'Attestation disabled',
                    message: 'Attestation is disabled for this device'
                });
            }

            // Create attestation report
            const reportData = {
                deviceId: device.id,
                reportVersion: req.body.reportVersion || 1,
                reportTimestamp: new Date(),
                pcrValues: req.body.pcrValues,
                measurements: req.body.measurements,
                signature: Buffer.from(req.body.signature, 'base64'),
                signatureAlgorithm: req.body.signatureAlgorithm,
                networkInfo: req.body.networkInfo || {},
                environmentInfo: req.body.environmentInfo || {},
                rawReportData: Buffer.from(JSON.stringify(req.body))
            };

            const report = await AttestationReport.create(reportData);

            logger.info('Attestation report submitted successfully', {
                reportId: report.id,
                deviceId: device.id,
                serialNumber: device.serialNumber,
                measurementCount: req.body.measurements.length,
                pcrCount: Object.keys(req.body.pcrValues).length
            });

            // Update device last seen time
            device.lastSeen = new Date();
            await device.save();

            // Start background verification process
            setImmediate(async () => {
                try {
                    await verifyAttestationReport(report, device);
                } catch (verifyError) {
                    logger.error('Background attestation verification failed', {
                        reportId: report.id,
                        error: verifyError.message
                    });
                }
            });

            res.status(201).json({
                success: true,
                data: {
                    reportId: report.id,
                    status: 'submitted',
                    verificationStatus: 'pending'
                },
                message: 'Attestation report submitted successfully'
            });

        } catch (error) {
            logger.error('Failed to submit attestation report', {
                error: error.message,
                stack: error.stack,
                deviceId: req.device?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to submit attestation report'
            });
        }
    }
);

/**
 * @route POST /api/v1/attestation/verify/:id
 * @desc Manually trigger verification of an attestation report
 * @access Private
 */
router.post('/verify/:id',
    authenticateToken,
    requireRole(['admin', 'security_analyst']),
    [
        param('id').isUUID().withMessage('Report ID must be a valid UUID')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const report = await AttestationReport.findByPk(req.params.id, {
                include: [
                    {
                        model: Device,
                        as: 'device'
                    }
                ]
            });

            if (!report) {
                return res.status(404).json({
                    error: 'Report not found',
                    message: `Attestation report with ID ${req.params.id} does not exist`
                });
            }

            if (report.verificationStatus === 'verified') {
                return res.status(400).json({
                    error: 'Already verified',
                    message: 'This attestation report has already been verified'
                });
            }

            // Perform verification
            const verificationResult = await verifyAttestationReport(report, report.device);

            logger.info('Manual attestation verification completed', {
                reportId: report.id,
                deviceId: report.deviceId,
                verificationStatus: report.verificationStatus,
                trustLevel: report.trustLevel,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: {
                    reportId: report.id,
                    verificationStatus: report.verificationStatus,
                    trustLevel: report.trustLevel,
                    trustScore: report.trustScore,
                    complianceStatus: report.complianceStatus,
                    verificationDetails: report.verificationDetails,
                    policyViolations: report.policyViolations
                },
                message: 'Attestation verification completed'
            });

        } catch (error) {
            logger.error('Failed to verify attestation report', {
                error: error.message,
                reportId: req.params.id,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to verify attestation report'
            });
        }
    }
);

/**
 * @route GET /api/v1/attestation/stats
 * @desc Get attestation statistics
 * @access Private
 */
router.get('/stats',
    authenticateToken,
    [
        query('period').optional().isIn(['24h', '7d', '30d', '90d']).withMessage('Invalid period')
    ],
    async (req, res) => {
        try {
            const { Op } = require('sequelize');
            const period = req.query.period || '24h';
            
            // Calculate time range
            const now = new Date();
            let since;
            switch (period) {
                case '24h':
                    since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case '90d':
                    since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    break;
            }

            // Get report counts by verification status
            const verificationCounts = await AttestationReport.findAll({
                attributes: [
                    'verificationStatus',
                    [AttestationReport.sequelize.fn('COUNT', AttestationReport.sequelize.col('id')), 'count']
                ],
                where: {
                    reportTimestamp: {
                        [Op.gte]: since
                    }
                },
                group: ['verificationStatus'],
                raw: true
            });

            // Get report counts by trust level
            const trustLevelCounts = await AttestationReport.findAll({
                attributes: [
                    'trustLevel',
                    [AttestationReport.sequelize.fn('COUNT', AttestationReport.sequelize.col('id')), 'count']
                ],
                where: {
                    reportTimestamp: {
                        [Op.gte]: since
                    }
                },
                group: ['trustLevel'],
                raw: true
            });

            // Get compliance status counts
            const complianceCounts = await AttestationReport.findAll({
                attributes: [
                    'complianceStatus',
                    [AttestationReport.sequelize.fn('COUNT', AttestationReport.sequelize.col('id')), 'count']
                ],
                where: {
                    reportTimestamp: {
                        [Op.gte]: since
                    }
                },
                group: ['complianceStatus'],
                raw: true
            });

            // Get total report count
            const totalReports = await AttestationReport.count({
                where: {
                    reportTimestamp: {
                        [Op.gte]: since
                    }
                }
            });

            // Get unique devices that reported
            const uniqueDevices = await AttestationReport.count({
                distinct: true,
                col: 'deviceId',
                where: {
                    reportTimestamp: {
                        [Op.gte]: since
                    }
                }
            });

            // Get policy violation count
            const violationCount = await AttestationReport.count({
                where: {
                    reportTimestamp: {
                        [Op.gte]: since
                    },
                    complianceStatus: 'non_compliant'
                }
            });

            const stats = {
                period,
                totalReports,
                uniqueDevices,
                violationCount,
                byVerificationStatus: verificationCounts.reduce((acc, item) => {
                    acc[item.verificationStatus] = parseInt(item.count);
                    return acc;
                }, {}),
                byTrustLevel: trustLevelCounts.reduce((acc, item) => {
                    acc[item.trustLevel] = parseInt(item.count);
                    return acc;
                }, {}),
                byComplianceStatus: complianceCounts.reduce((acc, item) => {
                    acc[item.complianceStatus] = parseInt(item.count);
                    return acc;
                }, {})
            };

            logger.info('Attestation statistics retrieved', {
                period,
                totalReports: stats.totalReports,
                uniqueDevices: stats.uniqueDevices,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: {
                    statistics: stats,
                    generatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Failed to get attestation statistics', {
                error: error.message,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to retrieve attestation statistics'
            });
        }
    }
);

/**
 * Background function to verify attestation report
 * @param {AttestationReport} report - Report to verify
 * @param {Device} device - Associated device
 * @returns {Promise<Object>} Verification result
 */
async function verifyAttestationReport(report, device) {
    try {
        // Step 1: Verify cryptographic signature
        const publicKeys = device.getPublicKeys();
        if (!publicKeys.dilithium) {
            throw new Error('Device public key not available');
        }

        const signatureValid = await verifyPQCSignature(
            report.rawReportData,
            report.signature,
            publicKeys.dilithium,
            report.signatureAlgorithm
        );

        if (!signatureValid) {
            report.verificationStatus = 'failed';
            report.verificationTimestamp = new Date();
            report.verificationDetails = { error: 'Invalid signature' };
            await report.save();
            
            // Log security event
            await logSecurityEvent({
                eventType: 'attestation_verification_failed',
                severity: 'high',
                deviceId: device.id,
                attestationReportId: report.id,
                description: 'Attestation report signature verification failed',
                metadata: { reason: 'invalid_signature' }
            });
            
            return { success: false, reason: 'invalid_signature' };
        }

        // Step 2: Load and evaluate security policies
        const policies = await loadSecurityPolicies(device.deviceType);
        const policyResult = await report.evaluatePolicies(policies);

        // Step 3: Update device attestation status
        await device.recordAttestation({
            result: policyResult.compliant ? 'success' : 'failure',
            trustLevel: report.trustLevel
        });

        // Step 4: Log security events for violations
        if (policyResult.violations.length > 0) {
            for (const violation of policyResult.violations) {
                await logSecurityEvent({
                    eventType: 'policy_violation',
                    severity: violation.severity,
                    deviceId: device.id,
                    attestationReportId: report.id,
                    description: violation.description,
                    metadata: {
                        policyId: violation.policyId,
                        rule: violation.rule
                    }
                });
            }
        }

        logger.info('Attestation report verification completed', {
            reportId: report.id,
            deviceId: device.id,
            signatureValid,
            compliant: policyResult.compliant,
            trustScore: report.trustScore,
            violationCount: policyResult.violations.length
        });

        return {
            success: true,
            signatureValid,
            compliant: policyResult.compliant,
            trustLevel: report.trustLevel,
            violations: policyResult.violations
        };

    } catch (error) {
        logger.error('Attestation verification error', {
            reportId: report.id,
            deviceId: device.id,
            error: error.message
        });

        // Mark as failed
        report.verificationStatus = 'failed';
        report.verificationTimestamp = new Date();
        report.verificationDetails = { error: error.message };
        await report.save();

        throw error;
    }
}

/**
 * Load security policies for device type
 * @param {string} deviceType - Type of device
 * @returns {Promise<Array>} Array of security policies
 */
async function loadSecurityPolicies(deviceType) {
    // In a real implementation, this would load policies from database or config
    // For now, return sample policies
    return [
        {
            id: 'baseline-pcr-policy',
            name: 'PCR Baseline Policy',
            type: 'pcr_baseline',
            version: '1.0',
            baselines: {
                '0': '0000000000000000000000000000000000000000000000000000000000000000', // Example baseline
                '1': '1111111111111111111111111111111111111111111111111111111111111111'
            }
        },
        {
            id: 'measurement-integrity-policy',
            name: 'Measurement Integrity Policy',
            type: 'measurement_integrity',
            version: '1.0',
            requiredMeasurements: ['firmware', 'configuration', 'runtime']
        },
        {
            id: 'temporal-freshness-policy',
            name: 'Temporal Freshness Policy',
            type: 'temporal_freshness',
            version: '1.0',
            maxAgeMinutes: 60
        }
    ];
}

module.exports = router;