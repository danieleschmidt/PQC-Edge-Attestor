const { Device } = require('../models');
const { DeviceRepository } = require('../repositories');
const { CryptoService } = require('../services');
const { validateInput, ValidationError } = require('../utils/validators');
const logger = require('../utils/logger');

class DeviceController {
  constructor(deviceRepository, cryptoService, cacheManager = null) {
    this.deviceRepository = deviceRepository;
    this.cryptoService = cryptoService;
    this.cache = cacheManager;
  }

  async registerDevice(req, res) {
    try {
      const deviceData = req.body;
      
      // Generate device ID if not provided
      if (!deviceData.id) {
        deviceData.id = Device.generateDeviceId(deviceData.serialNumber, deviceData.manufacturer);
      }

      // Create and validate device
      const device = new Device(deviceData);
      
      // Check for existing device with same serial number
      const existingDevice = await this.deviceRepository.findBySerialNumber(device.serialNumber);
      if (existingDevice) {
        return res.status(409).json({
          error: 'Device with this serial number already exists',
          deviceId: existingDevice.id
        });
      }

      // Save device to repository
      const savedDevice = await this.deviceRepository.create(device);
      
      logger.auditLog('device_register', {
        deviceId: savedDevice.id,
        deviceType: savedDevice.deviceType,
        manufacturer: savedDevice.manufacturer,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.status(201).json({
        success: true,
        device: savedDevice.toJSON(),
        message: 'Device registered successfully'
      });

    } catch (error) {
      logger.error('Device registration failed', {
        error: error.message,
        deviceData: req.body,
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

  async getDevice(req, res) {
    try {
      const { deviceId } = req.params;
      
      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      // Update last seen timestamp
      await this.deviceRepository.updateLastSeen(deviceId);

      res.json({
        success: true,
        device: device.toJSON()
      });

    } catch (error) {
      logger.error('Get device failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async listDevices(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        manufacturer,
        search
      } = req.query;

      let devices;
      let pagination;

      if (search) {
        // Perform search
        const result = await this.deviceRepository.searchDevices({
          query: search,
          type,
          status,
          manufacturer,
          limit: parseInt(limit),
          offset: (parseInt(page) - 1) * parseInt(limit)
        });
        
        devices = result.rows.map(device => device.toJSON());
        pagination = {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.count,
          pages: Math.ceil(result.count / parseInt(limit))
        };
      } else {
        // Regular listing with filters
        const options = {
          page: parseInt(page),
          limit: parseInt(limit)
        };

        if (type) options.where = { device_type: type };
        if (status) options.where = { ...options.where, status };
        if (manufacturer) options.where = { ...options.where, manufacturer };

        const result = await this.deviceRepository.paginate(options);
        devices = result.data.map(device => device.toJSON());
        pagination = result.pagination;
      }

      res.json({
        success: true,
        devices,
        pagination
      });

    } catch (error) {
      logger.error('List devices failed', {
        query: req.query,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async updateDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const updateData = req.body;

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.serialNumber;
      delete updateData.createdAt;

      const updatedDevice = await this.deviceRepository.update(deviceId, updateData);
      if (!updatedDevice) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      logger.auditLog('device_update', {
        deviceId,
        updateData,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        device: updatedDevice.toJSON(),
        message: 'Device updated successfully'
      });

    } catch (error) {
      logger.error('Update device failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async deleteDevice(req, res) {
    try {
      const { deviceId } = req.params;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      // Soft delete by setting status to revoked
      await this.deviceRepository.revokeDevice(deviceId, 'manual_deletion');

      logger.auditLog('device_delete', {
        deviceId,
        serialNumber: device.serialNumber,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Device deleted successfully'
      });

    } catch (error) {
      logger.error('Delete device failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async provisionDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const { algorithms, force = false } = req.body;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      if (device.status === 'provisioned' && !force) {
        return res.status(409).json({
          error: 'Device already provisioned',
          message: 'Use force=true to re-provision'
        });
      }

      // Validate algorithms
      const validAlgorithms = {
        kem: algorithms.kem || 'kyber1024',
        signature: algorithms.signature || 'dilithium5'
      };

      // Generate cryptographic keys
      const kemKeyPair = await this.cryptoService.generateKEMKeyPair(validAlgorithms.kem);
      const signKeyPair = await this.cryptoService.generateSignatureKeyPair(validAlgorithms.signature);

      // Update device with provisioning data
      const updatedDevice = await this.deviceRepository.provisionDevice(
        deviceId,
        validAlgorithms,
        {
          kemPublicKey: kemKeyPair.publicKey,
          signPublicKey: signKeyPair.publicKey,
          provisionedAt: new Date(),
          keygenMetadata: {
            kemKeyLength: kemKeyPair.keyLength,
            signKeyLength: signKeyPair.keyLength
          }
        }
      );

      logger.auditLog('device_provision', {
        deviceId,
        algorithms: validAlgorithms,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        device: updatedDevice.toJSON(),
        provisioning: {
          algorithms: validAlgorithms,
          publicKeys: {
            kem: kemKeyPair.publicKey,
            signature: signKeyPair.publicKey
          },
          securityLevel: Math.min(
            this.cryptoService.getSecurityLevel(validAlgorithms.kem),
            this.cryptoService.getSecurityLevel(validAlgorithms.signature)
          )
        },
        message: 'Device provisioned successfully'
      });

    } catch (error) {
      logger.error('Device provisioning failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async revokeDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const { reason = 'manual_revocation' } = req.body;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      if (device.status === 'revoked') {
        return res.status(409).json({
          error: 'Device already revoked'
        });
      }

      await this.deviceRepository.revokeDevice(deviceId, reason);

      logger.securityEvent('device_revoked', {
        deviceId,
        reason,
        serialNumber: device.serialNumber,
        severity: 'medium',
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Device revoked successfully'
      });

    } catch (error) {
      logger.error('Device revocation failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async getDeviceStatistics(req, res) {
    try {
      const stats = await this.deviceRepository.getDeviceStatistics();
      
      // Add health metrics
      const healthyCount = await this.deviceRepository.getHealthyDeviceCount();
      stats.health = {
        healthy: healthyCount,
        total: stats.activity.total,
        healthPercentage: stats.activity.total > 0 
          ? ((healthyCount / stats.activity.total) * 100).toFixed(2)
          : 0
      };

      res.json({
        success: true,
        statistics: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get device statistics failed', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async updatePQCAlgorithms(req, res) {
    try {
      const { deviceId } = req.params;
      const { algorithms } = req.body;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      // Validate algorithms
      const validatedAlgorithms = {};
      if (algorithms.kem) {
        const supportedKEM = this.cryptoService.getSupportedAlgorithms().kem;
        if (!supportedKEM.includes(algorithms.kem)) {
          return res.status(400).json({
            error: 'Unsupported KEM algorithm',
            supported: supportedKEM
          });
        }
        validatedAlgorithms.kem = algorithms.kem;
      }

      if (algorithms.signature) {
        const supportedSig = this.cryptoService.getSupportedAlgorithms().signature;
        if (!supportedSig.includes(algorithms.signature)) {
          return res.status(400).json({
            error: 'Unsupported signature algorithm',
            supported: supportedSig
          });
        }
        validatedAlgorithms.signature = algorithms.signature;
      }

      const updatedDevice = await this.deviceRepository.updatePQCAlgorithms(
        deviceId, 
        { ...device.pqcAlgorithms, ...validatedAlgorithms }
      );

      logger.auditLog('device_algorithm_update', {
        deviceId,
        oldAlgorithms: device.pqcAlgorithms,
        newAlgorithms: updatedDevice.pqcAlgorithms,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        device: updatedDevice.toJSON(),
        message: 'PQC algorithms updated successfully'
      });

    } catch (error) {
      logger.error('Update PQC algorithms failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async bulkUpdateStatus(req, res) {
    try {
      const { deviceIds, status } = req.body;

      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          error: 'deviceIds must be a non-empty array'
        });
      }

      const validStatuses = ['unprovisioned', 'provisioned', 'active', 'inactive', 'revoked'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          validStatuses
        });
      }

      const updatedCount = await this.deviceRepository.bulkUpdateStatus(deviceIds, status);

      logger.auditLog('device_bulk_status_update', {
        deviceIds,
        status,
        updatedCount,
        userId: req.user?.id,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        updatedCount,
        totalRequested: deviceIds.length,
        message: `${updatedCount} devices updated successfully`
      });

    } catch (error) {
      logger.error('Bulk status update failed', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async getHealthStatus(req, res) {
    try {
      const { deviceId } = req.params;

      const device = await this.deviceRepository.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      const health = {
        deviceId: device.id,
        status: device.status,
        isHealthy: device.isHealthy(),
        lastSeen: device.lastSeen,
        lastAttestation: device.lastAttestation,
        riskScore: device.lastAttestation?.riskScore || null,
        uptime: device.lastSeen ? Date.now() - new Date(device.lastSeen).getTime() : null,
        checks: {
          hasRecentAttestation: !!device.lastAttestation,
          attestationValid: device.lastAttestation?.verificationResult || false,
          riskAcceptable: (device.lastAttestation?.riskScore || 1) < 0.5,
          statusActive: device.status === 'active'
        }
      };

      res.json({
        success: true,
        health,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get device health failed', {
        deviceId: req.params.deviceId,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
}

module.exports = DeviceController;