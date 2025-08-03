/**
 * @file devices.js
 * @brief Device management REST API endpoints
 * 
 * This module implements REST API endpoints for device registration,
 * management, and status monitoring in the PQC-Edge-Attestor system.
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Device, AttestationReport } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateDevice } = require('../validators/deviceValidator');
const { logSecurityEvent } = require('../utils/securityLogger');
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
    defaultMeta: { service: 'device-api' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Rate limiting for device endpoints
const deviceRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiting to all device routes
router.use(deviceRateLimit);

/**
 * @route GET /api/v1/devices
 * @desc Get all devices with optional filtering and pagination
 * @access Private
 */
router.get('/', 
    authenticateToken,
    [
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('status').optional().isIn(['provisioning', 'active', 'inactive', 'maintenance', 'compromised', 'decommissioned']),
        query('deviceType').optional().isIn(['smart_meter', 'ev_charger', 'grid_controller', 'iot_gateway', 'sensor_node', 'development_board']),
        query('trustLevel').optional().isIn(['unknown', 'low', 'medium', 'high', 'critical']),
        query('organizationId').optional().isUUID(),
        query('search').optional().isLength({ max: 255 }).trim()
    ],
    async (req, res) => {
        try {
            // Validate request parameters
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
            
            if (req.query.status) {
                whereClause.status = req.query.status;
            }
            
            if (req.query.deviceType) {
                whereClause.deviceType = req.query.deviceType;
            }
            
            if (req.query.trustLevel) {
                whereClause.trustLevel = req.query.trustLevel;
            }
            
            if (req.query.organizationId) {
                whereClause.organizationId = req.query.organizationId;
            }

            // Search functionality
            if (req.query.search) {
                const { Op } = require('sequelize');
                whereClause[Op.or] = [
                    { serialNumber: { [Op.iLike]: `%${req.query.search}%` } },
                    { deploymentLocation: { [Op.iLike]: `%${req.query.search}%` } },
                    { notes: { [Op.iLike]: `%${req.query.search}%` } }
                ];
            }

            // Execute query with pagination
            const { count, rows: devices } = await Device.findAndCountAll({
                where: whereClause,
                limit,
                offset,
                order: [['lastSeen', 'DESC'], ['createdAt', 'DESC']],
                include: [
                    {
                        model: AttestationReport,
                        as: 'attestationReports',
                        limit: 1,
                        order: [['reportTimestamp', 'DESC']],
                        required: false
                    }
                ]
            });

            // Calculate pagination metadata
            const totalPages = Math.ceil(count / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            // Convert devices to safe JSON (excluding sensitive data)
            const safeDevices = devices.map(device => device.toSafeJSON());

            logger.info('Devices retrieved successfully', {
                count: devices.length,
                total: count,
                page,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: {
                    devices: safeDevices,
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
            logger.error('Failed to retrieve devices', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to retrieve devices'
            });
        }
    }
);

/**
 * @route GET /api/v1/devices/:id
 * @desc Get a specific device by ID
 * @access Private
 */
router.get('/:id',
    authenticateToken,
    [
        param('id').isUUID().withMessage('Device ID must be a valid UUID')
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

            const device = await Device.findByPk(req.params.id, {
                include: [
                    {
                        model: AttestationReport,
                        as: 'attestationReports',
                        limit: 10,
                        order: [['reportTimestamp', 'DESC']]
                    }
                ]
            });

            if (!device) {
                return res.status(404).json({
                    error: 'Device not found',
                    message: `Device with ID ${req.params.id} does not exist`
                });
            }

            logger.info('Device retrieved successfully', {
                deviceId: device.id,
                serialNumber: device.serialNumber,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: {
                    device: device.toSafeJSON()
                }
            });

        } catch (error) {
            logger.error('Failed to retrieve device', {
                error: error.message,
                deviceId: req.params.id,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to retrieve device'
            });
        }
    }
);

/**
 * @route POST /api/v1/devices
 * @desc Register a new device
 * @access Private
 */
router.post('/',
    authenticateToken,
    requireRole(['admin', 'device_manager']),
    [
        body('serialNumber').notEmpty().isLength({ max: 64 }).trim().withMessage('Serial number is required and must be max 64 characters'),
        body('deviceType').isIn(['smart_meter', 'ev_charger', 'grid_controller', 'iot_gateway', 'sensor_node', 'development_board']).withMessage('Invalid device type'),
        body('hardwareVersion').optional().isLength({ max: 32 }).trim(),
        body('firmwareVersion').optional().isLength({ max: 32 }).trim(),
        body('manufacturerId').optional().isLength({ max: 64 }).trim(),
        body('modelId').optional().isLength({ max: 64 }).trim(),
        body('securityLevel').optional().isIn([1, 3, 5]).withMessage('Security level must be 1, 3, or 5'),
        body('deploymentLocation').optional().isLength({ max: 256 }).trim(),
        body('organizationId').optional().isUUID().withMessage('Organization ID must be a valid UUID'),
        body('pqcAlgorithms').optional().isObject(),
        body('networkConfig').optional().isObject(),
        body('tags').optional().isObject()
    ],
    validateDevice,
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            // Check if device with same serial number already exists
            const existingDevice = await Device.findOne({
                where: { serialNumber: req.body.serialNumber.toUpperCase() }
            });

            if (existingDevice) {
                return res.status(409).json({
                    error: 'Device already exists',
                    message: `Device with serial number ${req.body.serialNumber} is already registered`
                });
            }

            // Create new device
            const deviceData = {
                serialNumber: req.body.serialNumber.toUpperCase(),
                deviceType: req.body.deviceType,
                hardwareVersion: req.body.hardwareVersion || '1.0',
                firmwareVersion: req.body.firmwareVersion || '1.0.0',
                manufacturerId: req.body.manufacturerId,
                modelId: req.body.modelId,
                securityLevel: req.body.securityLevel || 5,
                deploymentLocation: req.body.deploymentLocation,
                organizationId: req.body.organizationId,
                pqcAlgorithms: req.body.pqcAlgorithms || {
                    kem: 'kyber1024',
                    signature: 'dilithium5',
                    alternative_signature: 'falcon1024'
                },
                networkConfig: req.body.networkConfig || {
                    interfaces: [],
                    protocols: ['mqtt', 'coap'],
                    encryption: 'tls13_pqc'
                },
                tags: req.body.tags || {},
                status: 'provisioning'
            };

            const device = await Device.create(deviceData);

            logger.info('Device registered successfully', {
                deviceId: device.id,
                serialNumber: device.serialNumber,
                deviceType: device.deviceType,
                userId: req.user.id
            });

            // Log security event
            await logSecurityEvent({
                eventType: 'device_registered',
                severity: 'info',
                deviceId: device.id,
                userId: req.user.id,
                description: `Device ${device.serialNumber} registered successfully`,
                metadata: {
                    deviceType: device.deviceType,
                    securityLevel: device.securityLevel
                }
            });

            res.status(201).json({
                success: true,
                data: {
                    device: device.toSafeJSON()
                },
                message: 'Device registered successfully'
            });

        } catch (error) {
            logger.error('Failed to register device', {
                error: error.message,
                stack: error.stack,
                requestBody: req.body,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to register device'
            });
        }
    }
);

/**
 * @route PUT /api/v1/devices/:id
 * @desc Update device information
 * @access Private
 */
router.put('/:id',
    authenticateToken,
    requireRole(['admin', 'device_manager']),
    [
        param('id').isUUID().withMessage('Device ID must be a valid UUID'),
        body('deviceType').optional().isIn(['smart_meter', 'ev_charger', 'grid_controller', 'iot_gateway', 'sensor_node', 'development_board']),
        body('status').optional().isIn(['provisioning', 'active', 'inactive', 'maintenance', 'compromised', 'decommissioned']),
        body('hardwareVersion').optional().isLength({ max: 32 }).trim(),
        body('firmwareVersion').optional().isLength({ max: 32 }).trim(),
        body('deploymentLocation').optional().isLength({ max: 256 }).trim(),
        body('attestationEnabled').optional().isBoolean(),
        body('attestationInterval').optional().isInt({ min: 1, max: 1440 }),
        body('continuousMonitoring').optional().isBoolean(),
        body('networkConfig').optional().isObject(),
        body('tags').optional().isObject(),
        body('notes').optional().isLength({ max: 1000 }).trim()
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

            const device = await Device.findByPk(req.params.id);
            if (!device) {
                return res.status(404).json({
                    error: 'Device not found',
                    message: `Device with ID ${req.params.id} does not exist`
                });
            }

            // Store original values for comparison
            const originalStatus = device.status;

            // Update allowed fields
            const updateFields = [
                'deviceType', 'status', 'hardwareVersion', 'firmwareVersion',
                'deploymentLocation', 'attestationEnabled', 'attestationInterval',
                'continuousMonitoring', 'networkConfig', 'tags', 'notes'
            ];

            updateFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    device[field] = req.body[field];
                }
            });

            await device.save();

            logger.info('Device updated successfully', {
                deviceId: device.id,
                serialNumber: device.serialNumber,
                changes: Object.keys(req.body),
                userId: req.user.id
            });

            // Log status changes as security events
            if (originalStatus !== device.status) {
                await logSecurityEvent({
                    eventType: 'device_status_changed',
                    severity: device.status === 'compromised' ? 'critical' : 'info',
                    deviceId: device.id,
                    userId: req.user.id,
                    description: `Device status changed from ${originalStatus} to ${device.status}`,
                    metadata: {
                        previousStatus: originalStatus,
                        newStatus: device.status
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    device: device.toSafeJSON()
                },
                message: 'Device updated successfully'
            });

        } catch (error) {
            logger.error('Failed to update device', {
                error: error.message,
                deviceId: req.params.id,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to update device'
            });
        }
    }
);

/**
 * @route DELETE /api/v1/devices/:id
 * @desc Soft delete a device (decommission)
 * @access Private
 */
router.delete('/:id',
    authenticateToken,
    requireRole(['admin']),
    [
        param('id').isUUID().withMessage('Device ID must be a valid UUID')
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

            const device = await Device.findByPk(req.params.id);
            if (!device) {
                return res.status(404).json({
                    error: 'Device not found',
                    message: `Device with ID ${req.params.id} does not exist`
                });
            }

            // Soft delete (mark as decommissioned)
            await device.updateStatus('decommissioned');

            logger.info('Device decommissioned successfully', {
                deviceId: device.id,
                serialNumber: device.serialNumber,
                userId: req.user.id
            });

            // Log security event
            await logSecurityEvent({
                eventType: 'device_decommissioned',
                severity: 'warning',
                deviceId: device.id,
                userId: req.user.id,
                description: `Device ${device.serialNumber} has been decommissioned`,
                metadata: {
                    previousStatus: device.status
                }
            });

            res.json({
                success: true,
                message: 'Device decommissioned successfully'
            });

        } catch (error) {
            logger.error('Failed to decommission device', {
                error: error.message,
                deviceId: req.params.id,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to decommission device'
            });
        }
    }
);

/**
 * @route POST /api/v1/devices/:id/keys
 * @desc Store public keys for a device
 * @access Private
 */
router.post('/:id/keys',
    authenticateToken,
    requireRole(['admin', 'device_manager']),
    [
        param('id').isUUID().withMessage('Device ID must be a valid UUID'),
        body('dilithiumPublicKey').optional().isBase64().withMessage('Dilithium public key must be base64 encoded'),
        body('kyberPublicKey').optional().isBase64().withMessage('Kyber public key must be base64 encoded')
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

            const device = await Device.findByPk(req.params.id);
            if (!device) {
                return res.status(404).json({
                    error: 'Device not found',
                    message: `Device with ID ${req.params.id} does not exist`
                });
            }

            // Prepare keys object
            const keys = {};
            if (req.body.dilithiumPublicKey) {
                keys.dilithium = Buffer.from(req.body.dilithiumPublicKey, 'base64');
            }
            if (req.body.kyberPublicKey) {
                keys.kyber = Buffer.from(req.body.kyberPublicKey, 'base64');
            }

            if (Object.keys(keys).length === 0) {
                return res.status(400).json({
                    error: 'No keys provided',
                    message: 'At least one public key must be provided'
                });
            }

            // Store public keys
            await device.storePublicKeys(keys);

            logger.info('Device public keys stored successfully', {
                deviceId: device.id,
                serialNumber: device.serialNumber,
                keyTypes: Object.keys(keys),
                userId: req.user.id
            });

            // Log security event
            await logSecurityEvent({
                eventType: 'device_keys_updated',
                severity: 'info',
                deviceId: device.id,
                userId: req.user.id,
                description: `Public keys updated for device ${device.serialNumber}`,
                metadata: {
                    keyTypes: Object.keys(keys)
                }
            });

            res.json({
                success: true,
                message: 'Public keys stored successfully',
                data: {
                    keysStored: Object.keys(keys)
                }
            });

        } catch (error) {
            logger.error('Failed to store device keys', {
                error: error.message,
                deviceId: req.params.id,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to store device keys'
            });
        }
    }
);

/**
 * @route GET /api/v1/devices/stats
 * @desc Get device statistics
 * @access Private
 */
router.get('/stats',
    authenticateToken,
    async (req, res) => {
        try {
            const { Op } = require('sequelize');
            
            // Get device counts by status
            const deviceCounts = await Device.findAll({
                attributes: [
                    'status',
                    [Device.sequelize.fn('COUNT', Device.sequelize.col('id')), 'count']
                ],
                group: ['status'],
                raw: true
            });

            // Get device counts by type
            const typeCounts = await Device.findAll({
                attributes: [
                    'deviceType',
                    [Device.sequelize.fn('COUNT', Device.sequelize.col('id')), 'count']
                ],
                group: ['deviceType'],
                raw: true
            });

            // Get trust level distribution
            const trustLevelCounts = await Device.findAll({
                attributes: [
                    'trustLevel',
                    [Device.sequelize.fn('COUNT', Device.sequelize.col('id')), 'count']
                ],
                group: ['trustLevel'],
                raw: true
            });

            // Get devices requiring attention
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const requiresAttention = await Device.count({
                where: {
                    [Op.or]: [
                        { status: 'maintenance' },
                        { status: 'compromised' },
                        { trustLevel: 'low' },
                        {
                            attestationEnabled: true,
                            lastAttestationTime: {
                                [Op.or]: [
                                    { [Op.is]: null },
                                    { [Op.lt]: oneDayAgo }
                                ]
                            }
                        }
                    ]
                }
            });

            // Get total device count
            const totalDevices = await Device.count({
                where: {
                    status: {
                        [Op.ne]: 'decommissioned'
                    }
                }
            });

            const stats = {
                totalDevices,
                requiresAttention,
                byStatus: deviceCounts.reduce((acc, item) => {
                    acc[item.status] = parseInt(item.count);
                    return acc;
                }, {}),
                byType: typeCounts.reduce((acc, item) => {
                    acc[item.deviceType] = parseInt(item.count);
                    return acc;
                }, {}),
                byTrustLevel: trustLevelCounts.reduce((acc, item) => {
                    acc[item.trustLevel] = parseInt(item.count);
                    return acc;
                }, {})
            };

            logger.info('Device statistics retrieved', {
                totalDevices: stats.totalDevices,
                requiresAttention: stats.requiresAttention,
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
            logger.error('Failed to get device statistics', {
                error: error.message,
                userId: req.user?.id
            });

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to retrieve device statistics'
            });
        }
    }
);

module.exports = router;