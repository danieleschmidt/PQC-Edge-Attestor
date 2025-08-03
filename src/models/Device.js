const crypto = require('crypto');
const { validateInput, ValidationError } = require('../utils/validators');

class Device {
    constructor(deviceData) {
        this.id = deviceData.id;
        this.serialNumber = deviceData.serialNumber;
        this.deviceType = deviceData.deviceType;
        this.hardwareVersion = deviceData.hardwareVersion;
        this.firmwareVersion = deviceData.firmwareVersion;
        this.manufacturer = deviceData.manufacturer;
        this.model = deviceData.model;
        this.status = deviceData.status || 'unprovisioned';
        this.provisionedAt = deviceData.provisionedAt;
        this.lastAttestation = deviceData.lastAttestation;
        this.certificates = deviceData.certificates || {};
        this.pqcAlgorithms = deviceData.pqcAlgorithms || {};
        this.attestationPolicy = deviceData.attestationPolicy || {};
        this.createdAt = deviceData.createdAt || new Date();
        this.updatedAt = deviceData.updatedAt || new Date();
        
        this.validate();
    }

    validate() {
        const schema = {
            id: { type: 'string', required: true, pattern: /^[a-f0-9]{32}$/ },
            serialNumber: { type: 'string', required: true, minLength: 8, maxLength: 64 },
            deviceType: { type: 'string', required: true, enum: ['smart_meter', 'ev_charger', 'gateway', 'sensor'] },
            hardwareVersion: { type: 'string', required: true, pattern: /^\d+\.\d+\.\d+$/ },
            firmwareVersion: { type: 'string', required: true, pattern: /^\d+\.\d+\.\d+$/ },
            manufacturer: { type: 'string', required: true, minLength: 2, maxLength: 100 },
            model: { type: 'string', required: true, minLength: 2, maxLength: 100 },
            status: { type: 'string', enum: ['unprovisioned', 'provisioned', 'active', 'inactive', 'revoked'] }
        };

        try {
            validateInput(this, schema);
        } catch (error) {
            throw new ValidationError(`Device validation failed: ${error.message}`);
        }
    }

    static generateDeviceId(serialNumber, manufacturer) {
        const hash = crypto.createHash('sha256');
        hash.update(`${manufacturer}:${serialNumber}`);
        return hash.digest('hex');
    }

    updateFirmware(newVersion, signature, algorithm = 'dilithium5') {
        if (!this.verifyFirmwareSignature(signature, algorithm)) {
            throw new Error('Invalid firmware signature');
        }
        
        this.firmwareVersion = newVersion;
        this.updatedAt = new Date();
        this.status = 'active';
        
        return true;
    }

    verifyFirmwareSignature(signature, algorithm) {
        const supportedAlgorithms = ['dilithium5', 'falcon1024', 'hybrid'];
        if (!supportedAlgorithms.includes(algorithm)) {
            throw new Error(`Unsupported signature algorithm: ${algorithm}`);
        }
        
        return true;
    }

    setPQCAlgorithms(algorithms) {
        const validAlgorithms = {
            kem: ['kyber768', 'kyber1024'],
            signature: ['dilithium3', 'dilithium5', 'falcon512', 'falcon1024'],
            hybrid: ['classical+pqc', 'pqc_only']
        };

        Object.entries(algorithms).forEach(([type, algorithm]) => {
            if (!validAlgorithms[type] || !validAlgorithms[type].includes(algorithm)) {
                throw new Error(`Invalid PQC algorithm: ${type}=${algorithm}`);
            }
        });

        this.pqcAlgorithms = { ...this.pqcAlgorithms, ...algorithms };
        this.updatedAt = new Date();
    }

    setAttestationPolicy(policy) {
        const policySchema = {
            measurementInterval: { type: 'number', min: 60, max: 86400 },
            requiredMeasurements: { type: 'array', items: { type: 'string' } },
            failureThreshold: { type: 'number', min: 1, max: 10 },
            alertEndpoints: { type: 'array', items: { type: 'string' } }
        };

        try {
            validateInput(policy, policySchema);
            this.attestationPolicy = policy;
            this.updatedAt = new Date();
        } catch (error) {
            throw new ValidationError(`Invalid attestation policy: ${error.message}`);
        }
    }

    recordAttestation(attestationData) {
        const attestation = {
            timestamp: new Date(),
            reportHash: attestationData.reportHash,
            measurements: attestationData.measurements,
            signature: attestationData.signature,
            verificationResult: attestationData.verificationResult,
            riskScore: this.calculateRiskScore(attestationData)
        };

        this.lastAttestation = attestation;
        this.updatedAt = new Date();
        
        if (attestation.verificationResult && attestation.riskScore < 0.3) {
            this.status = 'active';
        } else {
            this.status = 'inactive';
        }

        return attestation;
    }

    calculateRiskScore(attestationData) {
        let riskScore = 0.0;
        
        if (!attestationData.verificationResult) {
            riskScore += 0.5;
        }
        
        if (attestationData.measurements.firmware_hash !== this.expectedFirmwareHash) {
            riskScore += 0.3;
        }
        
        if (Date.now() - new Date(attestationData.timestamp).getTime() > 300000) {
            riskScore += 0.2;
        }
        
        return Math.min(riskScore, 1.0);
    }

    isHealthy() {
        if (this.status !== 'active') return false;
        if (!this.lastAttestation) return false;
        
        const lastAttestationAge = Date.now() - new Date(this.lastAttestation.timestamp).getTime();
        const maxAge = (this.attestationPolicy.measurementInterval || 300) * 1000 * 2;
        
        return lastAttestationAge < maxAge && this.lastAttestation.riskScore < 0.5;
    }

    toJSON() {
        return {
            id: this.id,
            serialNumber: this.serialNumber,
            deviceType: this.deviceType,
            hardwareVersion: this.hardwareVersion,
            firmwareVersion: this.firmwareVersion,
            manufacturer: this.manufacturer,
            model: this.model,
            status: this.status,
            provisionedAt: this.provisionedAt,
            lastAttestation: this.lastAttestation,
            pqcAlgorithms: this.pqcAlgorithms,
            attestationPolicy: this.attestationPolicy,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            isHealthy: this.isHealthy()
        };
    }

    static fromJSON(data) {
        return new Device(data);
    }
}

module.exports = Device;