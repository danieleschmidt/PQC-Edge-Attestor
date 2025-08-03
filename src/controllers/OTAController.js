const { CryptoService } = require('../services');
const { validateInput, ValidationError } = require('../utils/validators');
const logger = require('../utils/logger');

class OTAController {
  constructor(deviceRepository, cryptoService, cacheManager = null) {
    this.deviceRepository = deviceRepository;
    this.cryptoService = cryptoService;
    this.cache = cacheManager;
  }

  async initiateUpdate(req, res) {
    try {
      const { deviceId } = req.params;
      const { 
        firmwareUrl, 
        version, 
        checksumSHA256, 
        signature, 
        algorithm = 'dilithium5',
        updateMetadata = {}
      } = req.body;

      // Validate device exists and is eligible for updates
      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      if (!['active', 'provisioned'].includes(device.status)) {
        return res.status(409).json({
          error: 'Device must be active or provisioned for firmware updates',
          currentStatus: device.status
        });
      }

      // Validate firmware version format
      if (!version || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(version)) {
        return res.status(400).json({
          error: 'Invalid firmware version format. Expected: x.y.z or x.y.z-suffix'
        });
      }

      // Check if this is actually an update (newer version)
      if (this.compareVersions(version, device.firmwareVersion) <= 0) {
        return res.status(409).json({
          error: 'Firmware version must be newer than current version',
          currentVersion: device.firmwareVersion,
          providedVersion: version
        });
      }

      // Validate signature algorithm is supported
      const supportedAlgorithms = this.cryptoService.getSupportedAlgorithms().signature;
      if (!supportedAlgorithms.includes(algorithm)) {
        return res.status(400).json({
          error: 'Unsupported signature algorithm',
          supported: supportedAlgorithms
        });
      }

      // Verify firmware signature
      const signatureValid = await this.cryptoService.verifySignature(
        checksumSHA256,
        signature,
        device.certificates?.signPublicKey,
        algorithm
      );

      if (!signatureValid) {
        logger.securityEvent('ota_signature_verification_failed', {
          deviceId,
          version,
          algorithm,
          severity: 'high'
        });

        return res.status(400).json({
          error: 'Firmware signature verification failed'
        });
      }

      // Create OTA update record
      const otaUpdate = {
        deviceId,
        firmwareUrl,
        version,
        currentVersion: device.firmwareVersion,
        checksumSHA256,
        signature,
        algorithm,
        status: 'pending',
        metadata: {
          ...updateMetadata,
          initiatedBy: req.user?.id,
          initiatedAt: new Date(),
          securityLevel: this.cryptoService.getSecurityLevel(algorithm)
        }
      };

      // Store update record (in a real implementation, this would be in an OTA updates table)
      const updateId = await this.storeOTAUpdate(otaUpdate);

      logger.auditLog('ota_update_initiated', {
        deviceId,
        updateId,
        fromVersion: device.firmwareVersion,
        toVersion: version,
        algorithm,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.status(201).json({
        success: true,
        otaUpdate: {
          id: updateId,
          deviceId,
          version,
          status: 'pending',
          algorithm,
          securityLevel: this.cryptoService.getSecurityLevel(algorithm)
        },
        instructions: {
          firmwareUrl,
          checksumSHA256,
          signature,
          algorithm,
          verificationRequired: true
        },
        message: 'OTA update initiated successfully'
      });

    } catch (error) {
      logger.error('OTA update initiation failed', {
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

  async updateStatus(req, res) {
    try {
      const { deviceId, updateId } = req.params;
      const { status, progress, errorDetails } = req.body;

      const validStatuses = ['pending', 'downloading', 'verifying', 'installing', 'completed', 'failed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          validStatuses
        });
      }

      // Validate device exists
      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      // Get OTA update record
      const otaUpdate = await this.getOTAUpdate(updateId);
      if (!otaUpdate || otaUpdate.deviceId !== deviceId) {
        return res.status(404).json({
          error: 'OTA update not found'
        });
      }

      // Update status
      const updatedOTA = await this.updateOTAStatus(updateId, {
        status,
        progress: progress || otaUpdate.progress,
        errorDetails: errorDetails || otaUpdate.errorDetails,
        lastUpdated: new Date()
      });

      // If completed successfully, update device firmware version
      if (status === 'completed') {
        await this.deviceRepository.update(deviceId, {
          firmwareVersion: otaUpdate.version,
          metadata: {
            ...device.metadata,
            lastOTAUpdate: new Date(),
            previousFirmwareVersion: device.firmwareVersion
          }
        });

        logger.securityEvent('ota_update_completed', {
          deviceId,
          updateId,
          fromVersion: otaUpdate.currentVersion,
          toVersion: otaUpdate.version,
          severity: 'low'
        });
      } else if (status === 'failed') {
        logger.securityEvent('ota_update_failed', {
          deviceId,
          updateId,
          errorDetails,
          severity: 'medium'
        });
      }

      logger.auditLog('ota_status_updated', {
        deviceId,
        updateId,
        status,
        progress,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        otaUpdate: updatedOTA,
        message: `OTA update status updated to ${status}`
      });

    } catch (error) {
      logger.error('OTA status update failed', {
        deviceId: req.params.deviceId,
        updateId: req.params.updateId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async getUpdateHistory(req, res) {
    try {
      const { deviceId } = req.params;
      const {
        page = 1,
        limit = 20,
        status
      } = req.query;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      const filters = { deviceId };
      if (status) filters.status = status;

      const updates = await this.getOTAUpdateHistory(filters, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        updates: updates.data,
        pagination: updates.pagination,
        summary: {
          totalUpdates: updates.pagination.total,
          successful: updates.data.filter(u => u.status === 'completed').length,
          failed: updates.data.filter(u => u.status === 'failed').length,
          pending: updates.data.filter(u => ['pending', 'downloading', 'verifying', 'installing'].includes(u.status)).length
        }
      });

    } catch (error) {
      logger.error('Get OTA update history failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async cancelUpdate(req, res) {
    try {
      const { deviceId, updateId } = req.params;
      const { reason = 'manual_cancellation' } = req.body;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      const otaUpdate = await this.getOTAUpdate(updateId);
      if (!otaUpdate || otaUpdate.deviceId !== deviceId) {
        return res.status(404).json({
          error: 'OTA update not found'
        });
      }

      if (['completed', 'failed', 'cancelled'].includes(otaUpdate.status)) {
        return res.status(409).json({
          error: 'Cannot cancel update',
          currentStatus: otaUpdate.status
        });
      }

      await this.updateOTAStatus(updateId, {
        status: 'cancelled',
        errorDetails: { reason, cancelledBy: req.user?.id, cancelledAt: new Date() },
        lastUpdated: new Date()
      });

      logger.auditLog('ota_update_cancelled', {
        deviceId,
        updateId,
        reason,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'OTA update cancelled successfully'
      });

    } catch (error) {
      logger.error('OTA update cancellation failed', {
        deviceId: req.params.deviceId,
        updateId: req.params.updateId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async getDeviceUpdateStatus(req, res) {
    try {
      const { deviceId } = req.params;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      // Get current/pending update
      const currentUpdate = await this.getCurrentOTAUpdate(deviceId);

      const status = {
        deviceId,
        currentFirmwareVersion: device.firmwareVersion,
        updateCapable: ['active', 'provisioned'].includes(device.status),
        currentUpdate: currentUpdate ? {
          id: currentUpdate.id,
          version: currentUpdate.version,
          status: currentUpdate.status,
          progress: currentUpdate.progress,
          startedAt: currentUpdate.createdAt
        } : null,
        lastUpdate: device.metadata?.lastOTAUpdate || null,
        supportedAlgorithms: this.cryptoService.getSupportedAlgorithms().signature
      };

      res.json({
        success: true,
        updateStatus: status
      });

    } catch (error) {
      logger.error('Get device update status failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  // Helper methods for OTA update storage (these would typically interact with a database)
  async storeOTAUpdate(otaData) {
    // Generate a UUID for the update
    const { v4: uuidv4 } = require('uuid');
    const updateId = uuidv4();
    
    // In a real implementation, this would store in an ota_updates table
    // For now, we'll simulate with metadata
    await this.deviceRepository.update(otaData.deviceId, {
      metadata: {
        currentOTAUpdate: {
          id: updateId,
          ...otaData,
          createdAt: new Date()
        }
      }
    });

    return updateId;
  }

  async getOTAUpdate(updateId) {
    // This would query the ota_updates table in a real implementation
    // For now, simulate by checking device metadata
    const devices = await this.deviceRepository.findAll();
    for (const device of devices) {
      if (device.metadata?.currentOTAUpdate?.id === updateId) {
        return device.metadata.currentOTAUpdate;
      }
    }
    return null;
  }

  async updateOTAStatus(updateId, statusData) {
    // Update the OTA record with new status
    const devices = await this.deviceRepository.findAll();
    for (const device of devices) {
      if (device.metadata?.currentOTAUpdate?.id === updateId) {
        const updatedOTA = {
          ...device.metadata.currentOTAUpdate,
          ...statusData
        };
        
        await this.deviceRepository.update(device.id, {
          metadata: {
            ...device.metadata,
            currentOTAUpdate: updatedOTA
          }
        });
        
        return updatedOTA;
      }
    }
    return null;
  }

  async getCurrentOTAUpdate(deviceId) {
    const device = await this.deviceRepository.findById(deviceId);
    return device?.metadata?.currentOTAUpdate || null;
  }

  async getOTAUpdateHistory(filters, pagination) {
    // This would query an ota_updates table in a real implementation
    // For now, return empty pagination structure
    return {
      data: [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: 0,
        pages: 0
      }
    };
  }

  compareVersions(version1, version2) {
    const v1Parts = version1.split(/[.-]/).map(p => parseInt(p) || 0);
    const v2Parts = version2.split(/[.-]/).map(p => parseInt(p) || 0);
    
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }
}

module.exports = OTAController;