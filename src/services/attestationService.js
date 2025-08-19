/**
 * @file attestationService.js
 * @brief Node.js service for hardware attestation operations - Generation 1
 */

const crypto = require('crypto');
const EventEmitter = require('events');
const PQCCryptoService = require('./pqcCryptoService');

class AttestationService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            deviceType: config.deviceType || 'DEVICE_TYPE_DEVELOPMENT_BOARD',
            deviceSerial: config.deviceSerial || this._generateDeviceSerial(),
            enableContinuousMonitoring: config.enableContinuousMonitoring || false,
            attestationIntervalMinutes: config.attestationIntervalMinutes || 60,
            ...config
        };
        
        this.pqcCrypto = new PQCCryptoService();
        this.initialized = false;
        this.deviceKeypair = null;
        this.deviceInfo = null;
        this.measurementLog = [];
        this.pcrs = Array(8).fill(null).map(() => Buffer.alloc(32, 0));
    }

    async initialize() {
        if (this.initialized) return;

        this.deviceInfo = {
            serialNumber: this.config.deviceSerial,
            deviceType: this.config.deviceType,
            hardwareVersion: 1,
            firmwareVersion: 1
        };

        this.deviceKeypair = await this.pqcCrypto.generateDilithiumKeypair();
        await this.collectMeasurements();
        this.initialized = true;
    }

    async collectMeasurements() {
        const measurements = [];
        
        const firmwareData = 'PQC-Edge-Attestor-v1.0.0';
        const firmwareMeasurement = crypto.createHash('sha256').update(firmwareData).digest();
        measurements.push({
            pcrIndex: 0,
            type: 'firmware',
            value: firmwareMeasurement,
            timestamp: Date.now()
        });

        this.measurementLog.push(...measurements);
        return measurements;
    }

    async generateAttestationReport() {
        await this.collectMeasurements();
        
        const report = {
            deviceId: this.deviceInfo.serialNumber,
            timestamp: Date.now(),
            measurements: this.measurementLog.slice(-10),
            pcrValues: this.pcrs.map(pcr => pcr.toString('hex'))
        };

        const reportData = JSON.stringify(report);
        const signature = await this.pqcCrypto.dilithiumSign(
            Buffer.from(reportData), 
            this.deviceKeypair.secretKey
        );
        
        report.signature = signature.toString('hex');
        return report;
    }

    _generateDeviceSerial() {
        return 'TERRAGON-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    }

    isInitialized() {
        return this.initialized;
    }

    cleanup() {
        this.initialized = false;
        this.pqcCrypto.cleanup();
    }
}

module.exports = AttestationService;