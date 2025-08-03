/**
 * @file attestationService.js
 * @brief Device attestation service for TPM-based hardware attestation
 * 
 * Implements remote attestation protocols using TPM 2.0 for hardware root of trust.
 * Handles platform measurements, attestation report generation, and verification.
 */

const crypto = require('crypto');
const winston = require('winston');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const PQCService = require('./pqcService');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'attestation-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/attestation-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/attestation-combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// TPM PCR (Platform Configuration Register) definitions
const TPM_PCRS = {
  FIRMWARE: 0,     // Firmware measurements
  BOOTLOADER: 1,   // Bootloader measurements
  OS_KERNEL: 2,    // OS kernel measurements
  OS_CONFIG: 3,    // OS configuration measurements
  BOOTLOADER_DATA: 4, // Bootloader data measurements
  BOOT_EVENTS: 5,  // Boot event measurements
  HOST_PLATFORM: 6, // Host platform measurements
  SECURE_BOOT: 7,  // Secure boot policy measurements
  CUSTOM_8: 8,     // Custom application measurements
  CUSTOM_9: 9,     // Custom application measurements
  IMA: 10,         // Linux IMA measurements
  CUSTOM_11: 11,   // Custom measurements
  CUSTOM_12: 12,   // Custom measurements
  CUSTOM_13: 13,   // Custom measurements
  CUSTOM_14: 14,   // Custom measurements
  CUSTOM_15: 15    // Custom measurements
};

// Attestation policy definitions
const ATTESTATION_POLICIES = {
  SMART_METER: {
    name: 'smart_meter_policy',
    requiredPcrs: [0, 1, 2, 3, 7, 8],
    allowedBootStates: ['secure_boot_enabled'],
    maxMeasurementAge: 300000, // 5 minutes
    criticalMeasurements: ['firmware_hash', 'bootloader_hash']
  },
  EV_CHARGER: {
    name: 'ev_charger_policy',
    requiredPcrs: [0, 1, 2, 3, 7, 8, 9],
    allowedBootStates: ['secure_boot_enabled'],
    maxMeasurementAge: 300000, // 5 minutes
    criticalMeasurements: ['firmware_hash', 'ocpp_config_hash']
  },
  IOT_GATEWAY: {
    name: 'iot_gateway_policy',
    requiredPcrs: [0, 1, 2, 3, 7, 8, 10],
    allowedBootStates: ['secure_boot_enabled'],
    maxMeasurementAge: 600000, // 10 minutes
    criticalMeasurements: ['firmware_hash', 'network_config_hash']
  }
};

class AttestationService {
  constructor() {
    this.pqcService = new PQCService();
    this.attestationCache = new Map();
    this.policyCache = new Map();
    this.metrics = {
      attestationsGenerated: 0,
      attestationsVerified: 0,
      attestationFailures: 0,
      averageLatency: 0
    };
  }

  /**
   * Initialize TPM and check hardware availability
   * @returns {Promise<boolean>} TPM initialization status
   */
  async initializeTPM() {
    try {
      // Check if TPM is available
      const { stdout } = await execAsync('tpm2_startup -c');
      
      // Get TPM capabilities
      const capabilities = await this.getTPMCapabilities();
      
      logger.info('TPM initialized successfully', {
        version: capabilities.version,
        algorithms: capabilities.algorithms
      });
      
      return true;
      
    } catch (error) {
      logger.error('TPM initialization failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get TPM capabilities and supported algorithms
   * @returns {Promise<Object>} TPM capabilities
   */
  async getTPMCapabilities() {
    try {
      const { stdout: versionOutput } = await execAsync('tpm2_getcap properties-fixed');
      const { stdout: algsOutput } = await execAsync('tpm2_getcap algorithms');
      
      return {
        version: this._parseTPMVersion(versionOutput),
        algorithms: this._parseTPMAlgorithms(algsOutput),
        pcrs: await this._getAvailablePCRs()
      };
      
    } catch (error) {
      logger.error('Failed to get TPM capabilities', { error: error.message });
      throw error;
    }
  }

  /**
   * Collect platform measurements from TPM PCRs
   * @param {Array<number>} pcrList - List of PCR indices to read
   * @returns {Promise<Object>} Platform measurements
   */
  async collectPlatformMeasurements(pcrList = [0, 1, 2, 3, 7, 8]) {
    const startTime = Date.now();
    
    try {
      const measurements = {};
      
      for (const pcrIndex of pcrList) {
        const { stdout } = await execAsync(`tpm2_pcrread sha256:${pcrIndex}`);
        const pcrValue = this._parsePCRValue(stdout);
        
        measurements[`pcr_${pcrIndex}`] = {
          index: pcrIndex,
          algorithm: 'sha256',
          value: pcrValue,
          timestamp: new Date().toISOString()
        };
      }
      
      // Add boot measurements
      measurements.boot_time = await this._getBootTime();
      measurements.secure_boot_status = await this._getSecureBootStatus();
      measurements.firmware_version = await this._getFirmwareVersion();
      
      logger.info('Platform measurements collected', {
        pcrCount: pcrList.length,
        duration: Date.now() - startTime
      });
      
      return {
        measurements: measurements,
        timestamp: new Date().toISOString(),
        collector: 'tpm2-tools',
        collectionTime: Date.now() - startTime
      };
      
    } catch (error) {
      logger.error('Failed to collect platform measurements', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate attestation report with post-quantum signatures
   * @param {string} deviceId - Device identifier
   * @param {string} deviceType - Type of device (smart_meter, ev_charger, etc.)
   * @param {Buffer} signingKey - Dilithium or Falcon secret key
   * @param {string} algorithm - Signature algorithm ('dilithium' or 'falcon')
   * @returns {Promise<Object>} Signed attestation report
   */
  async generateAttestationReport(deviceId, deviceType, signingKey, algorithm = 'dilithium') {
    const startTime = Date.now();
    
    try {
      // Get attestation policy for device type
      const policy = ATTESTATION_POLICIES[deviceType.toUpperCase()] || ATTESTATION_POLICIES.IOT_GATEWAY;
      
      // Collect platform measurements according to policy
      const platformData = await this.collectPlatformMeasurements(policy.requiredPcrs);
      
      // Create attestation report structure
      const report = {
        header: {
          version: '1.0',
          deviceId: deviceId,
          deviceType: deviceType,
          timestamp: new Date().toISOString(),
          nonce: crypto.randomBytes(32).toString('hex'),
          attestationType: 'tpm_based'
        },
        platformMeasurements: platformData.measurements,
        securityState: {
          secureBootEnabled: platformData.measurements.secure_boot_status,
          firmwareVersion: platformData.measurements.firmware_version,
          tpmPresent: true,
          measurementTimestamp: platformData.timestamp
        },
        policy: {
          name: policy.name,
          requiredPcrs: policy.requiredPcrs,
          criticalMeasurements: policy.criticalMeasurements
        }
      };
      
      // Generate quote using TPM
      const quote = await this._generateTPMQuote(policy.requiredPcrs, report.header.nonce);
      report.tpmQuote = quote;
      
      // Serialize report for signing
      const reportBytes = Buffer.from(JSON.stringify(report, null, 0), 'utf8');
      
      // Sign with post-quantum algorithm
      let signature;
      switch (algorithm.toLowerCase()) {
        case 'dilithium':
          signature = await this.pqcService.dilithiumSign(reportBytes, signingKey);
          break;
        case 'falcon':
          signature = await this.pqcService.falconSign(reportBytes, signingKey);
          break;
        default:
          throw new Error(`Unsupported signature algorithm: ${algorithm}`);
      }
      
      const signedReport = {
        report: report,
        signature: {
          algorithm: algorithm,
          value: signature.signature.toString('base64'),
          keyId: crypto.createHash('sha256').update(signingKey).digest('hex').substring(0, 16)
        },
        metadata: {
          generationTime: Date.now() - startTime,
          generator: 'pqc-edge-attestor',
          version: '1.0.0'
        }
      };
      
      // Cache attestation for performance
      this.attestationCache.set(deviceId, {
        report: signedReport,
        timestamp: Date.now(),
        ttl: policy.maxMeasurementAge
      });
      
      this.metrics.attestationsGenerated++;
      this.metrics.averageLatency = (this.metrics.averageLatency + (Date.now() - startTime)) / this.metrics.attestationsGenerated;
      
      logger.info('Attestation report generated', {
        deviceId: deviceId,
        deviceType: deviceType,
        algorithm: algorithm,
        reportSize: Buffer.byteLength(JSON.stringify(signedReport)),
        duration: Date.now() - startTime
      });
      
      return signedReport;
      
    } catch (error) {
      this.metrics.attestationFailures++;
      logger.error('Attestation report generation failed', {
        deviceId: deviceId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify attestation report and signature
   * @param {Object} signedReport - Signed attestation report
   * @param {Buffer} publicKey - Verification public key
   * @param {string} algorithm - Signature algorithm used
   * @returns {Promise<Object>} Verification result
   */
  async verifyAttestationReport(signedReport, publicKey, algorithm = 'dilithium') {
    const startTime = Date.now();
    
    try {
      // Validate report structure
      if (!signedReport.report || !signedReport.signature) {
        throw new Error('Invalid attestation report structure');
      }
      
      const report = signedReport.report;
      const signature = Buffer.from(signedReport.signature.value, 'base64');
      
      // Verify timestamp freshness
      const reportTime = new Date(report.header.timestamp).getTime();
      const now = Date.now();
      const maxAge = 600000; // 10 minutes
      
      if (now - reportTime > maxAge) {
        return {
          valid: false,
          reason: 'Report timestamp too old',
          details: { age: now - reportTime, maxAge: maxAge }
        };
      }
      
      // Recreate report bytes for signature verification
      const reportBytes = Buffer.from(JSON.stringify(report, null, 0), 'utf8');
      
      // Verify post-quantum signature
      let signatureValid;
      switch (algorithm.toLowerCase()) {
        case 'dilithium':
          const dilithiumResult = await this.pqcService.dilithiumVerify(signature, reportBytes, publicKey);
          signatureValid = dilithiumResult.valid;
          break;
        case 'falcon':
          const falconResult = await this.pqcService.falconVerify(signature, reportBytes, publicKey);
          signatureValid = falconResult.valid;
          break;
        default:
          throw new Error(`Unsupported signature algorithm: ${algorithm}`);
      }
      
      if (!signatureValid) {
        return {
          valid: false,
          reason: 'Invalid post-quantum signature',
          details: { algorithm: algorithm }
        };
      }
      
      // Verify TPM quote if present
      let tpmQuoteValid = true;
      if (report.tpmQuote) {
        tpmQuoteValid = await this._verifyTPMQuote(report.tpmQuote, report.header.nonce);
      }
      
      // Verify policy compliance
      const deviceType = report.header.deviceType.toUpperCase();
      const policy = ATTESTATION_POLICIES[deviceType] || ATTESTATION_POLICIES.IOT_GATEWAY;
      const policyCompliance = this._verifyPolicyCompliance(report, policy);
      
      this.metrics.attestationsVerified++;
      
      const result = {
        valid: signatureValid && tpmQuoteValid && policyCompliance.compliant,
        signatureValid: signatureValid,
        tpmQuoteValid: tpmQuoteValid,
        policyCompliant: policyCompliance.compliant,
        policyViolations: policyCompliance.violations,
        deviceId: report.header.deviceId,
        verificationTime: Date.now() - startTime,
        details: {
          algorithm: algorithm,
          reportAge: now - reportTime,
          pcrCount: Object.keys(report.platformMeasurements).filter(k => k.startsWith('pcr_')).length
        }
      };
      
      logger.info('Attestation report verified', result);
      
      return result;
      
    } catch (error) {
      this.metrics.attestationFailures++;
      logger.error('Attestation verification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get cached attestation if available and valid
   * @param {string} deviceId - Device identifier
   * @returns {Object|null} Cached attestation or null
   */
  getCachedAttestation(deviceId) {
    const cached = this.attestationCache.get(deviceId);
    
    if (!cached) {
      return null;
    }
    
    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      this.attestationCache.delete(deviceId);
      return null;
    }
    
    return cached.report;
  }

  /**
   * Set custom attestation policy for device type
   * @param {string} deviceType - Device type identifier
   * @param {Object} policy - Attestation policy
   */
  setAttestationPolicy(deviceType, policy) {
    const validatedPolicy = {
      name: policy.name || `${deviceType}_policy`,
      requiredPcrs: policy.requiredPcrs || [0, 1, 2, 3, 7],
      allowedBootStates: policy.allowedBootStates || ['secure_boot_enabled'],
      maxMeasurementAge: policy.maxMeasurementAge || 300000,
      criticalMeasurements: policy.criticalMeasurements || ['firmware_hash']
    };
    
    this.policyCache.set(deviceType.toUpperCase(), validatedPolicy);
    
    logger.info('Attestation policy updated', {
      deviceType: deviceType,
      policy: validatedPolicy
    });
  }

  /**
   * Get attestation metrics for monitoring
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.attestationCache.size,
      successRate: this.metrics.attestationsGenerated > 0 ? 
        (this.metrics.attestationsGenerated - this.metrics.attestationFailures) / this.metrics.attestationsGenerated : 0
    };
  }

  // Private helper methods

  /**
   * Generate TPM quote for attestation
   * @param {Array<number>} pcrList - PCRs to include in quote
   * @param {string} nonce - Nonce for quote freshness
   * @returns {Promise<Object>} TPM quote
   */
  async _generateTPMQuote(pcrList, nonce) {
    try {
      const pcrSelection = pcrList.map(pcr => `sha256:${pcr}`).join(',');
      const { stdout } = await execAsync(`tpm2_quote -c 0x81000001 -l ${pcrSelection} -q ${nonce} -m quote.msg -s quote.sig -o quote.pcrs`);
      
      return {
        message: await this._readFileAsBase64('quote.msg'),
        signature: await this._readFileAsBase64('quote.sig'),
        pcrs: await this._readFileAsBase64('quote.pcrs'),
        nonce: nonce
      };
      
    } catch (error) {
      logger.error('TPM quote generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify TPM quote authenticity
   * @param {Object} quote - TPM quote to verify
   * @param {string} expectedNonce - Expected nonce
   * @returns {Promise<boolean>} Quote validity
   */
  async _verifyTPMQuote(quote, expectedNonce) {
    try {
      // Write quote files for verification
      await this._writeBase64ToFile(quote.message, 'verify_quote.msg');
      await this._writeBase64ToFile(quote.signature, 'verify_quote.sig');
      await this._writeBase64ToFile(quote.pcrs, 'verify_quote.pcrs');
      
      // Verify quote using TPM tools
      const { stdout } = await execAsync(`tpm2_checkquote -c 0x81000001 -m verify_quote.msg -s verify_quote.sig -f verify_quote.pcrs -q ${expectedNonce}`);
      
      return stdout.includes('Quote verification succeeded');
      
    } catch (error) {
      logger.error('TPM quote verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Verify policy compliance for attestation report
   * @param {Object} report - Attestation report
   * @param {Object} policy - Attestation policy
   * @returns {Object} Compliance result
   */
  _verifyPolicyCompliance(report, policy) {
    const violations = [];
    
    // Check required PCRs
    for (const requiredPcr of policy.requiredPcrs) {
      if (!report.platformMeasurements[`pcr_${requiredPcr}`]) {
        violations.push(`Missing required PCR ${requiredPcr}`);
      }
    }
    
    // Check secure boot status
    if (policy.allowedBootStates && policy.allowedBootStates.includes('secure_boot_enabled')) {
      if (!report.securityState.secureBootEnabled) {
        violations.push('Secure boot not enabled');
      }
    }
    
    // Check measurement freshness
    const measurementTime = new Date(report.securityState.measurementTimestamp).getTime();
    const age = Date.now() - measurementTime;
    if (age > policy.maxMeasurementAge) {
      violations.push(`Measurements too old: ${age}ms > ${policy.maxMeasurementAge}ms`);
    }
    
    return {
      compliant: violations.length === 0,
      violations: violations
    };
  }

  _parseTPMVersion(output) {
    const versionMatch = output.match(/TPM_PT_FAMILY_INDICATOR:\s+([0-9.]+)/);
    return versionMatch ? versionMatch[1] : 'unknown';
  }

  _parseTPMAlgorithms(output) {
    const algorithms = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('alg:')) {
        const algMatch = line.match(/alg:(\w+)/);
        if (algMatch) {
          algorithms.push(algMatch[1]);
        }
      }
    }
    return algorithms;
  }

  _parsePCRValue(output) {
    const pcrMatch = output.match(/[0-9]+\s+:\s+([A-Fa-f0-9]+)/);
    return pcrMatch ? pcrMatch[1] : null;
  }

  async _getAvailablePCRs() {
    try {
      const { stdout } = await execAsync('tpm2_pcrread');
      const pcrs = [];
      const lines = stdout.split('\n');
      for (const line of lines) {
        const pcrMatch = line.match(/^\s*(\d+)\s+:/);
        if (pcrMatch) {
          pcrs.push(parseInt(pcrMatch[1]));
        }
      }
      return pcrs;
    } catch (error) {
      return [0, 1, 2, 3, 7]; // Default PCRs
    }
  }

  async _getBootTime() {
    try {
      const { stdout } = await execAsync('cat /proc/stat | grep btime');
      const bootMatch = stdout.match(/btime\s+(\d+)/);
      return bootMatch ? new Date(parseInt(bootMatch[1]) * 1000).toISOString() : null;
    } catch (error) {
      return null;
    }
  }

  async _getSecureBootStatus() {
    try {
      const { stdout } = await execAsync('mokutil --sb-state 2>/dev/null || echo "unknown"');
      return stdout.includes('SecureBoot enabled');
    } catch (error) {
      return false;
    }
  }

  async _getFirmwareVersion() {
    try {
      const { stdout } = await execAsync('cat /sys/class/dmi/id/bios_version 2>/dev/null || echo "unknown"');
      return stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  async _readFileAsBase64(filename) {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(filename);
      return data.toString('base64');
    } catch (error) {
      throw new Error(`Failed to read file ${filename}: ${error.message}`);
    }
  }

  async _writeBase64ToFile(base64Data, filename) {
    const fs = require('fs').promises;
    try {
      const data = Buffer.from(base64Data, 'base64');
      await fs.writeFile(filename, data);
    } catch (error) {
      throw new Error(`Failed to write file ${filename}: ${error.message}`);
    }
  }
}

module.exports = AttestationService;
