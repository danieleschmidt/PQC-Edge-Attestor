const crypto = require('crypto');
const { AttestationReport, Device } = require('../models');
const { ValidationError } = require('../utils/validators');
const logger = require('../utils/logger');

class AttestationService {
    constructor(options = {}) {
        this.options = {
            maxReportAge: options.maxReportAge || 300000, // 5 minutes
            riskThreshold: options.riskThreshold || 0.5,
            supportedAlgorithms: options.supportedAlgorithms || ['dilithium5', 'falcon1024', 'hybrid'],
            verificationTimeout: options.verificationTimeout || 30000,
            ...options
        };
        
        this.verificationCache = new Map();
        this.deviceRegistry = options.deviceRegistry;
        this.policyEngine = options.policyEngine;
    }

    async collectDeviceMeasurements(deviceId, challenge = null) {
        try {
            const device = await this.deviceRegistry.getDevice(deviceId);
            if (!device) {
                throw new Error(`Device not found: ${deviceId}`);
            }

            const nonce = challenge || AttestationReport.generateNonce();
            
            const measurements = await this.gatherPlatformMeasurements(device);
            
            const report = new AttestationReport({
                deviceId: device.id,
                nonce: nonce,
                measurements: measurements,
                attestationLevel: 'device',
                platformInfo: {
                    hardwareVersion: device.hardwareVersion,
                    firmwareVersion: device.firmwareVersion,
                    manufacturer: device.manufacturer,
                    model: device.model
                }
            });

            logger.info('Device measurements collected', { 
                deviceId, 
                reportId: report.id,
                measurementCount: Object.keys(measurements).length 
            });

            return report;

        } catch (error) {
            logger.error('Failed to collect device measurements', { deviceId, error: error.message });
            throw error;
        }
    }

    async gatherPlatformMeasurements(device) {
        const measurements = {};

        try {
            measurements.firmware_hash = await this.measureFirmware(device);
            measurements.bootloader_hash = await this.measureBootloader(device);
            measurements.configuration_hash = await this.measureConfiguration(device);
            measurements.pcr_values = await this.readTPMPCRs(device);
            measurements.runtime_measurements = await this.collectRuntimeMeasurements(device);
            
            measurements.measurement_timestamp = new Date().toISOString();
            measurements.platform_state = await this.assessPlatformState(device);

        } catch (error) {
            logger.error('Error gathering platform measurements', { 
                deviceId: device.id, 
                error: error.message 
            });
            throw new Error(`Platform measurement failed: ${error.message}`);
        }

        return measurements;
    }

    async measureFirmware(device) {
        const firmwareImage = await this.getFirmwareImage(device);
        const hash = crypto.createHash('sha256');
        hash.update(firmwareImage);
        return hash.digest('hex');
    }

    async measureBootloader(device) {
        const bootloaderImage = await this.getBootloaderImage(device);
        const hash = crypto.createHash('sha256');
        hash.update(bootloaderImage);
        return hash.digest('hex');
    }

    async measureConfiguration(device) {
        const config = await this.getDeviceConfiguration(device);
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(config, Object.keys(config).sort()));
        return hash.digest('hex');
    }

    async readTPMPCRs(device) {
        const pcrValues = [];
        
        for (let i = 0; i < 24; i++) {
            try {
                const pcrValue = await this.readTPMPCR(device, i);
                pcrValues.push({
                    index: i,
                    value: pcrValue,
                    algorithm: 'sha256'
                });
            } catch (error) {
                logger.warn(`Failed to read PCR ${i}`, { deviceId: device.id, error: error.message });
            }
        }

        return pcrValues;
    }

    async readTPMPCR(device, pcrIndex) {
        return crypto.randomBytes(32).toString('hex');
    }

    async collectRuntimeMeasurements(device) {
        return {
            memory_integrity: await this.checkMemoryIntegrity(device),
            process_list: await this.getRunningProcesses(device),
            network_connections: await this.getNetworkConnections(device),
            file_integrity: await this.checkCriticalFiles(device)
        };
    }

    async assessPlatformState(device) {
        const checks = await Promise.allSettled([
            this.checkSecureBoot(device),
            this.checkTPMPresence(device),
            this.checkCryptoAccelerator(device),
            this.checkDebugInterfaces(device)
        ]);

        const state = {
            secure_boot: checks[0].status === 'fulfilled' ? checks[0].value : false,
            tpm_present: checks[1].status === 'fulfilled' ? checks[1].value : false,
            crypto_accelerator: checks[2].status === 'fulfilled' ? checks[2].value : false,
            debug_disabled: checks[3].status === 'fulfilled' ? checks[3].value : false
        };

        state.overall_trust_level = this.calculateTrustLevel(state);
        return state;
    }

    calculateTrustLevel(platformState) {
        let trustScore = 0;
        if (platformState.secure_boot) trustScore += 0.3;
        if (platformState.tmp_present) trustScore += 0.3;
        if (platformState.crypto_accelerator) trustScore += 0.2;
        if (platformState.debug_disabled) trustScore += 0.2;

        if (trustScore >= 0.8) return 'high';
        if (trustScore >= 0.6) return 'medium';
        if (trustScore >= 0.4) return 'low';
        return 'untrusted';
    }

    async signAttestationReport(report, devicePrivateKey, algorithm = 'dilithium5') {
        try {
            if (!this.options.supportedAlgorithms.includes(algorithm)) {
                throw new Error(`Unsupported signature algorithm: ${algorithm}`);
            }

            const signature = report.sign(devicePrivateKey, algorithm);
            
            logger.info('Attestation report signed', { 
                reportId: report.id, 
                deviceId: report.deviceId,
                algorithm: algorithm,
                signatureLength: signature.length || JSON.stringify(signature).length
            });

            return signature;

        } catch (error) {
            logger.error('Failed to sign attestation report', { 
                reportId: report.id, 
                error: error.message 
            });
            throw error;
        }
    }

    async verifyAttestationReport(report, devicePublicKey, policy = null) {
        try {
            const startTime = Date.now();
            
            if (this.verificationCache.has(report.id)) {
                const cached = this.verificationCache.get(report.id);
                if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
                    return cached.result;
                }
            }

            const verificationResult = await this.performVerification(report, devicePublicKey, policy);
            
            this.verificationCache.set(report.id, {
                result: verificationResult,
                timestamp: Date.now()
            });

            const verificationTime = Date.now() - startTime;
            
            logger.info('Attestation report verified', { 
                reportId: report.id,
                deviceId: report.deviceId,
                verificationResult: verificationResult.isValid,
                riskScore: verificationResult.riskAssessment.score,
                verificationTime: `${verificationTime}ms`
            });

            return verificationResult;

        } catch (error) {
            logger.error('Attestation verification failed', { 
                reportId: report.id, 
                error: error.message 
            });
            throw error;
        }
    }

    async performVerification(report, devicePublicKey, policy) {
        const verificationResult = {
            reportId: report.id,
            deviceId: report.deviceId,
            isValid: false,
            signatureValid: false,
            policyCompliant: false,
            riskAssessment: null,
            violations: [],
            verifiedAt: new Date()
        };

        try {
            verificationResult.signatureValid = report.verify(devicePublicKey);
            
            if (!verificationResult.signatureValid) {
                verificationResult.violations.push('invalid_signature');
            }

            const reportAge = Date.now() - new Date(report.timestamp).getTime();
            if (reportAge > this.options.maxReportAge) {
                verificationResult.violations.push('stale_report');
            }

            if (policy) {
                const policyResult = await this.policyEngine.evaluate(report, policy);
                verificationResult.policyCompliant = policyResult.compliant;
                
                if (!policyResult.compliant) {
                    verificationResult.violations.push(...policyResult.violations);
                }
            } else {
                verificationResult.policyCompliant = true;
            }

            report.verificationResult = verificationResult.signatureValid;
            const riskAssessment = report.assessRisk();
            verificationResult.riskAssessment = riskAssessment;

            if (riskAssessment.score > this.options.riskThreshold) {
                verificationResult.violations.push('high_risk_score');
            }

            verificationResult.isValid = verificationResult.signatureValid && 
                                       verificationResult.policyCompliant && 
                                       riskAssessment.score <= this.options.riskThreshold;

        } catch (error) {
            logger.error('Verification process error', { 
                reportId: report.id, 
                error: error.message 
            });
            verificationResult.violations.push('verification_error');
        }

        return verificationResult;
    }

    async getFirmwareImage(device) {
        return Buffer.from('mock_firmware_data_' + device.firmwareVersion);
    }

    async getBootloaderImage(device) {
        return Buffer.from('mock_bootloader_data_' + device.hardwareVersion);
    }

    async getDeviceConfiguration(device) {
        return {
            deviceId: device.id,
            algorithms: device.pqcAlgorithms,
            policy: device.attestationPolicy,
            version: device.firmwareVersion
        };
    }

    async checkMemoryIntegrity(device) {
        return { status: 'intact', checksum: crypto.randomBytes(16).toString('hex') };
    }

    async getRunningProcesses(device) {
        return ['pqc-attestor', 'network-daemon', 'crypto-service'];
    }

    async getNetworkConnections(device) {
        return [
            { protocol: 'coap', port: 5683, state: 'listening' },
            { protocol: 'mqtt', port: 8883, state: 'connected' }
        ];
    }

    async checkCriticalFiles(device) {
        return { 
            '/etc/pqc/config.json': crypto.randomBytes(16).toString('hex'),
            '/usr/bin/pqc-attestor': crypto.randomBytes(16).toString('hex')
        };
    }

    async checkSecureBoot(device) {
        return true;
    }

    async checkTPMPresence(device) {
        return true;
    }

    async checkCryptoAccelerator(device) {
        return device.hardwareVersion.includes('crypto');
    }

    async checkDebugInterfaces(device) {
        return true; // debug disabled
    }

    clearVerificationCache() {
        this.verificationCache.clear();
        logger.info('Verification cache cleared');
    }

    getVerificationStats() {
        return {
            cacheSize: this.verificationCache.size,
            options: this.options
        };
    }
}

module.exports = AttestationService;