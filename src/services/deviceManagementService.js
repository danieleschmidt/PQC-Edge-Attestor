/**
 * @file deviceManagementService.js
 * @brief Device lifecycle management service for IoT edge devices
 * 
 * Handles device provisioning, key management, certificate lifecycle,
 * and secure OTA firmware updates for post-quantum enabled devices.
 */

const crypto = require('crypto');
const winston = require('winston');
const EventEmitter = require('events');
const PQCService = require('./pqcService');
const AttestationService = require('./attestationService');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'device-management' },
  transports: [
    new winston.transports.File({ filename: 'logs/device-mgmt-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/device-mgmt-combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Device states
const DEVICE_STATES = {
  PROVISIONING: 'provisioning',
  ACTIVE: 'active',
  UPDATING: 'updating',
  MAINTENANCE: 'maintenance',
  COMPROMISED: 'compromised',
  DECOMMISSIONED: 'decommissioned'
};

// Device types and their configurations
const DEVICE_TYPES = {
  SMART_METER: {
    name: 'smart_meter',
    attestationInterval: 300000, // 5 minutes
    firmwareUpdateWindow: [2, 5], // 2 AM to 5 AM
    maxFirmwareSize: 2097152, // 2 MB
    requiredCapabilities: ['tpm', 'secure_storage', 'pqc']
  },
  EV_CHARGER: {
    name: 'ev_charger',
    attestationInterval: 600000, // 10 minutes
    firmwareUpdateWindow: [1, 4], // 1 AM to 4 AM
    maxFirmwareSize: 4194304, // 4 MB
    requiredCapabilities: ['tpm', 'secure_storage', 'pqc', 'ocpp']
  },
  IOT_GATEWAY: {
    name: 'iot_gateway',
    attestationInterval: 900000, // 15 minutes
    firmwareUpdateWindow: [3, 6], // 3 AM to 6 AM
    maxFirmwareSize: 8388608, // 8 MB
    requiredCapabilities: ['tpm', 'secure_storage', 'pqc', 'mesh_networking']
  }
};

// Certificate validity periods
const CERT_VALIDITY = {
  DEVICE_CERT: 365 * 24 * 60 * 60 * 1000, // 1 year
  INTERMEDIATE_CERT: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
  ROOT_CERT: 10 * 365 * 24 * 60 * 60 * 1000 // 10 years
};

class DeviceManagementService extends EventEmitter {
  constructor() {
    super();
    this.pqcService = new PQCService();
    this.attestationService = new AttestationService();
    this.devices = new Map();
    this.pendingUpdates = new Map();
    this.certificateChain = new Map();
    this.metrics = {
      devicesProvisioned: 0,
      firmwareUpdatesCompleted: 0,
      attestationFailures: 0,
      certificatesIssued: 0
    };
    
    // Initialize periodic tasks
    this._startPeriodicTasks();
  }

  /**
   * Provision new IoT device with post-quantum credentials
   * @param {Object} deviceInfo - Device information
   * @returns {Promise<Object>} Provisioning result
   */
  async provisionDevice(deviceInfo) {
    const startTime = Date.now();
    const deviceId = deviceInfo.serialNumber || crypto.randomUUID();
    
    try {
      logger.info('Starting device provisioning', {
        deviceId: deviceId,
        deviceType: deviceInfo.deviceType,
        manufacturer: deviceInfo.manufacturer
      });
      
      // Validate device type
      const deviceType = DEVICE_TYPES[deviceInfo.deviceType.toUpperCase()];
      if (!deviceType) {
        throw new Error(`Unsupported device type: ${deviceInfo.deviceType}`);
      }
      
      // Generate device identity keys
      const identityKeys = await this._generateDeviceIdentityKeys(deviceInfo.pqcAlgorithm || 'dilithium');
      
      // Generate device attestation keys  
      const attestationKeys = await this._generateDeviceAttestationKeys(deviceInfo.pqcAlgorithm || 'dilithium');
      
      // Generate device encryption keys
      const encryptionKeys = await this.pqcService.generateKyberKeyPair();
      
      // Create device certificate
      const deviceCertificate = await this._generateDeviceCertificate({
        deviceId: deviceId,
        publicKey: identityKeys.publicKey,
        deviceInfo: deviceInfo,
        validityPeriod: CERT_VALIDITY.DEVICE_CERT
      });
      
      // Create device record
      const device = {
        id: deviceId,
        info: deviceInfo,
        type: deviceType,
        state: DEVICE_STATES.PROVISIONING,
        keys: {
          identity: identityKeys,
          attestation: attestationKeys,
          encryption: encryptionKeys
        },
        certificate: deviceCertificate,
        provisionedAt: new Date().toISOString(),
        lastAttestation: null,
        firmwareVersion: deviceInfo.firmwareVersion || '1.0.0',
        securityLevel: deviceInfo.securityLevel || 5,
        networkConfig: {
          endpoint: null,
          lastSeen: null,
          ipAddress: null
        },
        metrics: {
          attestationCount: 0,
          lastUpdate: null,
          uptime: 0
        }
      };
      
      // Store device securely
      this.devices.set(deviceId, device);
      
      // Generate provisioning package
      const provisioningPackage = await this._createProvisioningPackage(device);
      
      // Update device state
      device.state = DEVICE_STATES.ACTIVE;
      
      this.metrics.devicesProvisioned++;
      
      logger.info('Device provisioning completed', {
        deviceId: deviceId,
        duration: Date.now() - startTime,
        certificateId: deviceCertificate.id
      });
      
      this.emit('deviceProvisioned', {
        deviceId: deviceId,
        deviceType: deviceInfo.deviceType,
        timestamp: new Date().toISOString()
      });
      
      return {
        deviceId: deviceId,
        provisioningPackage: provisioningPackage,
        certificate: deviceCertificate,
        status: 'success',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Device provisioning failed', {
        deviceId: deviceId,
        error: error.message
      });
      
      this.emit('provisioningFailed', {
        deviceId: deviceId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Perform device attestation and verify device integrity
   * @param {string} deviceId - Device identifier
   * @returns {Promise<Object>} Attestation result
   */
  async performDeviceAttestation(deviceId) {
    const startTime = Date.now();
    
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        throw new Error(`Device not found: ${deviceId}`);
      }
      
      logger.info('Starting device attestation', {
        deviceId: deviceId,
        deviceType: device.type.name
      });
      
      // Check if cached attestation is still valid
      const cachedAttestation = this.attestationService.getCachedAttestation(deviceId);
      if (cachedAttestation) {
        logger.info('Using cached attestation', { deviceId: deviceId });
        return {
          result: 'cached',
          attestation: cachedAttestation,
          timestamp: new Date().toISOString()
        };
      }
      
      // Generate new attestation report
      const attestationReport = await this.attestationService.generateAttestationReport(
        deviceId,
        device.type.name,
        device.keys.attestation.secretKey,
        'dilithium'
      );
      
      // Verify attestation report
      const verificationResult = await this.attestationService.verifyAttestationReport(
        attestationReport,
        device.keys.attestation.publicKey,
        'dilithium'
      );
      
      // Update device record
      device.lastAttestation = {
        timestamp: new Date().toISOString(),
        result: verificationResult,
        report: attestationReport
      };
      device.metrics.attestationCount++;
      
      // Handle attestation failure
      if (!verificationResult.valid) {
        device.state = DEVICE_STATES.COMPROMISED;
        this.metrics.attestationFailures++;
        
        logger.error('Device attestation failed', {
          deviceId: deviceId,
          reason: verificationResult.reason,
          violations: verificationResult.policyViolations
        });
        
        this.emit('attestationFailed', {
          deviceId: deviceId,
          result: verificationResult,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.info('Device attestation successful', {
          deviceId: deviceId,
          duration: Date.now() - startTime
        });
        
        this.emit('attestationSuccess', {
          deviceId: deviceId,
          result: verificationResult,
          timestamp: new Date().toISOString()
        });
      }
      
      return {
        result: verificationResult.valid ? 'success' : 'failure',
        attestation: attestationReport,
        verification: verificationResult,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      this.metrics.attestationFailures++;
      
      logger.error('Device attestation error', {
        deviceId: deviceId,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Deploy firmware update to device
   * @param {string} deviceId - Device identifier
   * @param {Object} firmwarePackage - Firmware update package
   * @returns {Promise<Object>} Update deployment result
   */
  async deployFirmwareUpdate(deviceId, firmwarePackage) {
    const startTime = Date.now();
    
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        throw new Error(`Device not found: ${deviceId}`);
      }
      
      // Validate firmware package
      await this._validateFirmwarePackage(firmwarePackage, device.type);
      
      // Check if device is in update window
      if (!this._isInUpdateWindow(device.type)) {
        throw new Error('Device not in allowed update window');
      }
      
      // Perform pre-update attestation
      const preUpdateAttestation = await this.performDeviceAttestation(deviceId);
      if (preUpdateAttestation.result !== 'success') {
        throw new Error('Pre-update attestation failed');
      }
      
      logger.info('Starting firmware update deployment', {
        deviceId: deviceId,
        firmwareVersion: firmwarePackage.version,
        packageSize: firmwarePackage.size
      });
      
      // Create signed update package
      const signedPackage = await this._createSignedFirmwarePackage(firmwarePackage, device);
      
      // Update device state
      device.state = DEVICE_STATES.UPDATING;
      this.pendingUpdates.set(deviceId, {
        package: signedPackage,
        startedAt: new Date().toISOString(),
        status: 'deploying'
      });
      
      // Deploy update (simulated - would use actual device communication)
      const deploymentResult = await this._deployToDevice(deviceId, signedPackage);
      
      if (deploymentResult.success) {
        // Update device record
        device.firmwareVersion = firmwarePackage.version;
        device.state = DEVICE_STATES.ACTIVE;
        device.metrics.lastUpdate = new Date().toISOString();
        
        this.pendingUpdates.delete(deviceId);
        this.metrics.firmwareUpdatesCompleted++;
        
        // Perform post-update attestation
        setTimeout(async () => {
          try {
            await this.performDeviceAttestation(deviceId);
          } catch (error) {
            logger.error('Post-update attestation failed', {
              deviceId: deviceId,
              error: error.message
            });
          }
        }, 30000); // Wait 30 seconds for device to reboot
        
        logger.info('Firmware update completed successfully', {
          deviceId: deviceId,
          newVersion: firmwarePackage.version,
          duration: Date.now() - startTime
        });
        
        this.emit('firmwareUpdateCompleted', {
          deviceId: deviceId,
          version: firmwarePackage.version,
          timestamp: new Date().toISOString()
        });
        
        return {
          status: 'success',
          previousVersion: device.firmwareVersion,
          newVersion: firmwarePackage.version,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        };
      } else {
        device.state = DEVICE_STATES.ACTIVE;
        this.pendingUpdates.delete(deviceId);
        
        throw new Error(`Firmware deployment failed: ${deploymentResult.error}`);
      }
      
    } catch (error) {
      logger.error('Firmware update deployment failed', {
        deviceId: deviceId,
        error: error.message
      });
      
      this.emit('firmwareUpdateFailed', {
        deviceId: deviceId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Get device information and status
   * @param {string} deviceId - Device identifier
   * @returns {Object} Device information
   */
  getDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    
    // Return device info without sensitive keys
    return {
      id: device.id,
      info: device.info,
      type: device.type.name,
      state: device.state,
      firmwareVersion: device.firmwareVersion,
      securityLevel: device.securityLevel,
      provisionedAt: device.provisionedAt,
      lastAttestation: device.lastAttestation ? {
        timestamp: device.lastAttestation.timestamp,
        result: device.lastAttestation.result.valid
      } : null,
      networkConfig: device.networkConfig,
      metrics: device.metrics,
      certificate: {
        id: device.certificate.id,
        validFrom: device.certificate.validFrom,
        validTo: device.certificate.validTo,
        issuer: device.certificate.issuer
      }
    };
  }

  /**
   * List all devices with optional filtering
   * @param {Object} filters - Filter criteria
   * @returns {Array<Object>} List of devices
   */
  listDevices(filters = {}) {
    const devices = Array.from(this.devices.values());
    
    return devices
      .filter(device => {
        if (filters.deviceType && device.type.name !== filters.deviceType) {
          return false;
        }
        if (filters.state && device.state !== filters.state) {
          return false;
        }
        if (filters.manufacturer && device.info.manufacturer !== filters.manufacturer) {
          return false;
        }
        return true;
      })
      .map(device => ({
        id: device.id,
        type: device.type.name,
        state: device.state,
        firmwareVersion: device.firmwareVersion,
        lastSeen: device.networkConfig.lastSeen,
        lastAttestation: device.lastAttestation?.timestamp || null
      }));
  }

  /**
   * Revoke device certificate and decommission device
   * @param {string} deviceId - Device identifier
   * @param {string} reason - Revocation reason
   * @returns {Promise<Object>} Revocation result
   */
  async revokeDevice(deviceId, reason = 'decommissioned') {
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        throw new Error(`Device not found: ${deviceId}`);
      }
      
      // Update device state
      device.state = DEVICE_STATES.DECOMMISSIONED;
      
      // Revoke certificate
      const revocationResult = await this._revokeCertificate(device.certificate.id, reason);
      
      // Clear sensitive data
      delete device.keys;
      
      logger.info('Device revoked successfully', {
        deviceId: deviceId,
        reason: reason,
        revocationId: revocationResult.id
      });
      
      this.emit('deviceRevoked', {
        deviceId: deviceId,
        reason: reason,
        timestamp: new Date().toISOString()
      });
      
      return {
        status: 'revoked',
        reason: reason,
        timestamp: new Date().toISOString(),
        revocationId: revocationResult.id
      };
      
    } catch (error) {
      logger.error('Device revocation failed', {
        deviceId: deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      totalDevices: this.devices.size,
      activeDevices: Array.from(this.devices.values()).filter(d => d.state === DEVICE_STATES.ACTIVE).length,
      devicesInUpdate: this.pendingUpdates.size,
      compromisedDevices: Array.from(this.devices.values()).filter(d => d.state === DEVICE_STATES.COMPROMISED).length
    };
  }

  // Private helper methods

  async _generateDeviceIdentityKeys(algorithm) {
    switch (algorithm.toLowerCase()) {
      case 'dilithium':
        return await this.pqcService.generateDilithiumKeyPair();
      case 'falcon':
        return await this.pqcService.generateFalconKeyPair();
      default:
        throw new Error(`Unsupported identity key algorithm: ${algorithm}`);
    }
  }

  async _generateDeviceAttestationKeys(algorithm) {
    // For attestation, we typically use the same algorithm as identity
    return await this._generateDeviceIdentityKeys(algorithm);
  }

  async _generateDeviceCertificate(certInfo) {
    const certificateId = crypto.randomUUID();
    const validFrom = new Date();
    const validTo = new Date(validFrom.getTime() + certInfo.validityPeriod);
    
    // Create certificate structure (simplified)
    const certificate = {
      id: certificateId,
      subject: {
        commonName: certInfo.deviceId,
        organizationUnit: certInfo.deviceInfo.deviceType,
        organization: certInfo.deviceInfo.manufacturer || 'Unknown',
        country: 'US'
      },
      issuer: {
        commonName: 'PQC-Edge-Attestor-CA',
        organization: 'Terragon Labs',
        country: 'US'
      },
      publicKey: certInfo.publicKey.toString('base64'),
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      serialNumber: crypto.randomBytes(16).toString('hex'),
      keyUsage: ['digitalSignature', 'keyEncipherment'],
      extendedKeyUsage: ['clientAuth', 'deviceAttestation'],
      issuedAt: new Date().toISOString()
    };
    
    // Store certificate in chain
    this.certificateChain.set(certificateId, certificate);
    this.metrics.certificatesIssued++;
    
    return certificate;
  }

  async _createProvisioningPackage(device) {
    return {
      deviceId: device.id,
      deviceType: device.type.name,
      identityKeys: {
        publicKey: device.keys.identity.publicKey.toString('base64'),
        algorithm: device.keys.identity.algorithm
      },
      encryptionKeys: {
        publicKey: device.keys.encryption.publicKey.toString('base64'),
        algorithm: device.keys.encryption.algorithm
      },
      certificate: device.certificate,
      endpoints: {
        attestation: `https://api.pqc-edge-attestor.com/v1/attestation`,
        updates: `https://api.pqc-edge-attestor.com/v1/updates`,
        management: `https://api.pqc-edge-attestor.com/v1/devices`
      },
      policies: {
        attestationInterval: device.type.attestationInterval,
        updateWindow: device.type.firmwareUpdateWindow
      }
    };
  }

  async _validateFirmwarePackage(firmwarePackage, deviceType) {
    if (!firmwarePackage.binary || !firmwarePackage.version || !firmwarePackage.signature) {
      throw new Error('Invalid firmware package structure');
    }
    
    if (firmwarePackage.binary.length > deviceType.maxFirmwareSize) {
      throw new Error(`Firmware too large: ${firmwarePackage.binary.length} > ${deviceType.maxFirmwareSize}`);
    }
    
    // Verify firmware signature (simplified)
    // In production, this would verify against a known signing key
    return true;
  }

  _isInUpdateWindow(deviceType) {
    const now = new Date();
    const hour = now.getHours();
    const [startHour, endHour] = deviceType.firmwareUpdateWindow;
    
    return hour >= startHour && hour < endHour;
  }

  async _createSignedFirmwarePackage(firmwarePackage, device) {
    // Sign firmware with device's identity key
    const firmwareHash = crypto.createHash('sha256').update(firmwarePackage.binary).digest();
    const signature = await this.pqcService.dilithiumSign(firmwareHash, device.keys.identity.secretKey);
    
    return {
      ...firmwarePackage,
      deviceId: device.id,
      signature: signature.signature.toString('base64'),
      hash: firmwareHash.toString('hex'),
      timestamp: new Date().toISOString()
    };
  }

  async _deployToDevice(deviceId, signedPackage) {
    // Simulate firmware deployment
    // In production, this would use actual device communication protocols
    
    logger.info('Simulating firmware deployment', {
      deviceId: deviceId,
      packageSize: signedPackage.binary.length
    });
    
    // Simulate deployment time
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Simulate success with 95% probability
    const success = Math.random() > 0.05;
    
    return {
      success: success,
      error: success ? null : 'Deployment timeout'
    };
  }

  async _revokeCertificate(certificateId, reason) {
    const certificate = this.certificateChain.get(certificateId);
    if (!certificate) {
      throw new Error(`Certificate not found: ${certificateId}`);
    }
    
    // Mark certificate as revoked
    certificate.revoked = {
      timestamp: new Date().toISOString(),
      reason: reason,
      revocationId: crypto.randomUUID()
    };
    
    return certificate.revoked;
  }

  _startPeriodicTasks() {
    // Periodic attestation check
    setInterval(async () => {
      for (const [deviceId, device] of this.devices) {
        if (device.state === DEVICE_STATES.ACTIVE) {
          const lastAttestation = device.lastAttestation?.timestamp;
          const now = Date.now();
          const interval = device.type.attestationInterval;
          
          if (!lastAttestation || now - new Date(lastAttestation).getTime() > interval) {
            try {
              await this.performDeviceAttestation(deviceId);
            } catch (error) {
              logger.error('Periodic attestation failed', {
                deviceId: deviceId,
                error: error.message
              });
            }
          }
        }
      }
    }, 60000); // Check every minute
    
    // Cleanup old attestation cache
    setInterval(() => {
      // This would clean up the attestation service cache
      logger.debug('Performing periodic cleanup');
    }, 300000); // Every 5 minutes
  }
}

module.exports = DeviceManagementService;
