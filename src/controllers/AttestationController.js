const { AttestationService } = require('../services');
const { validateInput, ValidationError } = require('../utils/validators');
const logger = require('../utils/logger');

class AttestationController {
  constructor(attestationService, deviceRepository, cacheManager = null) {
    this.attestationService = attestationService;
    this.deviceRepository = deviceRepository;
    this.cache = cacheManager;
  }

  async submitReport(req, res) {
    try {
      const { deviceId } = req.params;
      const { measurements, signature, nonce, platformInfo } = req.body;

      // Validate device exists
      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      if (device.status !== 'active') {
        return res.status(409).json({
          error: 'Device must be active to submit attestation reports',
          deviceStatus: device.status
        });
      }

      // Validate required fields
      if (!measurements || !signature || !nonce) {
        return res.status(400).json({
          error: 'Missing required fields: measurements, signature, nonce'
        });
      }

      // Process attestation report
      const reportData = {
        deviceId,
        measurements,
        signature,
        nonce,
        platformInfo: platformInfo || {},
        signatureAlgorithm: device.pqcAlgorithms?.signature || 'dilithium5'
      };

      const verificationResult = await this.attestationService.verifyAttestationReport(
        reportData,
        device.certificates?.signPublicKey,
        device.attestationPolicy
      );

      // Store the report
      const attestationReport = await this.attestationService.storeAttestationReport({
        ...reportData,
        verificationResult: verificationResult.isValid,
        verificationDetails: verificationResult.details,
        riskAssessment: verificationResult.riskAssessment,
        policyCompliance: verificationResult.policyCompliant
      });

      // Update device last attestation
      await this.deviceRepository.updateLastSeen(deviceId);

      logger.auditLog('attestation_submitted', {
        deviceId,
        reportId: attestationReport.id,
        verificationResult: verificationResult.isValid,
        riskScore: verificationResult.riskAssessment?.riskScore,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.status(201).json({
        success: true,
        attestationReport: {
          id: attestationReport.id,
          verificationResult: verificationResult.isValid,
          riskScore: verificationResult.riskAssessment?.riskScore,
          policyCompliant: verificationResult.policyCompliant
        },
        message: 'Attestation report submitted successfully'
      });

    } catch (error) {
      logger.error('Attestation submission failed', {
        deviceId: req.params.deviceId,
        error: error.message,
        ipAddress: req.ip
      });

      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.message
        });
      }

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async getDeviceReports(req, res) {
    try {
      const { deviceId } = req.params;
      const {
        page = 1,
        limit = 20,
        verified,
        startDate,
        endDate
      } = req.query;

      // Validate device exists
      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      const filters = { deviceId };

      if (verified !== undefined) {
        filters.verificationResult = verified === 'true';
      }

      if (startDate) {
        filters.startDate = new Date(startDate);
      }

      if (endDate) {
        filters.endDate = new Date(endDate);
      }

      const reports = await this.attestationService.getDeviceReports(filters, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        reports: reports.data,
        pagination: reports.pagination,
        summary: {
          totalReports: reports.pagination.total,
          verifiedReports: reports.data.filter(r => r.verificationResult === true).length,
          averageRiskScore: reports.data.length > 0 
            ? reports.data.reduce((sum, r) => sum + (r.riskAssessment?.riskScore || 0), 0) / reports.data.length
            : 0
        }
      });

    } catch (error) {
      logger.error('Get device reports failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async getReport(req, res) {
    try {
      const { reportId } = req.params;

      const report = await this.attestationService.getReportById(reportId);
      if (!report) {
        return res.status(404).json({
          error: 'Attestation report not found'
        });
      }

      res.json({
        success: true,
        report: report.toJSON()
      });

    } catch (error) {
      logger.error('Get attestation report failed', {
        reportId: req.params.reportId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async verifyReport(req, res) {
    try {
      const { reportId } = req.params;
      const { force = false } = req.body;

      const report = await this.attestationService.getReportById(reportId);
      if (!report) {
        return res.status(404).json({
          error: 'Attestation report not found'
        });
      }

      if (report.verificationResult !== null && !force) {
        return res.status(409).json({
          error: 'Report already verified',
          currentResult: report.verificationResult,
          message: 'Use force=true to re-verify'
        });
      }

      // Get device for public key
      const device = await this.deviceRepository.findById(report.deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Associated device not found'
        });
      }

      const verificationResult = await this.attestationService.verifyAttestationReport(
        {
          measurements: report.measurements,
          signature: report.signature,
          nonce: report.nonce,
          platformInfo: report.platformInfo
        },
        device.certificates?.signPublicKey,
        device.attestationPolicy
      );

      // Update report with verification results
      const updatedReport = await this.attestationService.updateReportVerification(
        reportId,
        verificationResult
      );

      logger.auditLog('attestation_reverified', {
        reportId,
        deviceId: report.deviceId,
        previousResult: report.verificationResult,
        newResult: verificationResult.isValid,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        report: updatedReport.toJSON(),
        verification: {
          isValid: verificationResult.isValid,
          details: verificationResult.details,
          riskScore: verificationResult.riskAssessment?.riskScore,
          policyCompliant: verificationResult.policyCompliant
        },
        message: 'Report re-verified successfully'
      });

    } catch (error) {
      logger.error('Report verification failed', {
        reportId: req.params.reportId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async getReportStatistics(req, res) {
    try {
      const {
        startDate,
        endDate,
        deviceType,
        manufacturer
      } = req.query;

      const filters = {};

      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      if (deviceType) filters.deviceType = deviceType;
      if (manufacturer) filters.manufacturer = manufacturer;

      const stats = await this.attestationService.getReportStatistics(filters);

      res.json({
        success: true,
        statistics: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get report statistics failed', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async requestAttestation(req, res) {
    try {
      const { deviceId } = req.params;
      const { challenge, timeout = 300000 } = req.body; // 5 minutes default

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      if (device.status !== 'active') {
        return res.status(409).json({
          error: 'Device must be active to request attestation',
          deviceStatus: device.status
        });
      }

      // Generate challenge if not provided
      const attestationChallenge = challenge || await this.attestationService.generateChallenge();

      // Store challenge for verification
      await this.attestationService.storeChallenge(deviceId, attestationChallenge, timeout);

      logger.auditLog('attestation_requested', {
        deviceId,
        challengeLength: attestationChallenge.length,
        timeout,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        attestationRequest: {
          deviceId,
          challenge: attestationChallenge,
          algorithm: device.pqcAlgorithms?.signature || 'dilithium5',
          expiresAt: new Date(Date.now() + timeout).toISOString()
        },
        message: 'Attestation challenge generated'
      });

    } catch (error) {
      logger.error('Attestation request failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async bulkVerifyReports(req, res) {
    try {
      const { reportIds, force = false } = req.body;

      if (!Array.isArray(reportIds) || reportIds.length === 0) {
        return res.status(400).json({
          error: 'reportIds must be a non-empty array'
        });
      }

      const results = await this.attestationService.bulkVerifyReports(reportIds, force);

      logger.auditLog('attestation_bulk_verify', {
        reportCount: reportIds.length,
        successCount: results.successful.length,
        failureCount: results.failed.length,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        results,
        summary: {
          total: reportIds.length,
          successful: results.successful.length,
          failed: results.failed.length,
          verified: results.successful.filter(r => r.verificationResult === true).length
        }
      });

    } catch (error) {
      logger.error('Bulk verify reports failed', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
}

module.exports = AttestationController;