const crypto = require('crypto');
const { validateInput, ValidationError } = require('../utils/validators');

class AttestationReport {
    constructor(reportData) {
        this.id = reportData.id || this.generateReportId();
        this.deviceId = reportData.deviceId;
        this.timestamp = reportData.timestamp || new Date();
        this.nonce = reportData.nonce;
        this.measurements = reportData.measurements || {};
        this.signature = reportData.signature;
        this.signatureAlgorithm = reportData.signatureAlgorithm || 'dilithium5';
        this.attestationLevel = reportData.attestationLevel || 'device';
        this.platformInfo = reportData.platformInfo || {};
        this.verificationResult = reportData.verificationResult;
        this.riskAssessment = reportData.riskAssessment;
        this.createdAt = reportData.createdAt || new Date();
        
        this.validate();
    }

    validate() {
        const schema = {
            deviceId: { type: 'string', required: true, pattern: /^[a-f0-9]{32}$/ },
            timestamp: { type: 'date', required: true },
            nonce: { type: 'string', required: true, minLength: 16, maxLength: 64 },
            measurements: { type: 'object', required: true },
            signatureAlgorithm: { 
                type: 'string', 
                enum: ['dilithium3', 'dilithium5', 'falcon512', 'falcon1024', 'hybrid'] 
            },
            attestationLevel: { type: 'string', enum: ['device', 'component', 'system'] }
        };

        try {
            validateInput(this, schema);
            this.validateMeasurements();
        } catch (error) {
            throw new ValidationError(`Attestation report validation failed: ${error.message}`);
        }
    }

    validateMeasurements() {
        const requiredMeasurements = [
            'firmware_hash',
            'bootloader_hash', 
            'configuration_hash',
            'pcr_values'
        ];

        for (const measurement of requiredMeasurements) {
            if (!this.measurements[measurement]) {
                throw new ValidationError(`Missing required measurement: ${measurement}`);
            }
        }

        if (this.measurements.pcr_values && !Array.isArray(this.measurements.pcr_values)) {
            throw new ValidationError('PCR values must be an array');
        }

        Object.entries(this.measurements).forEach(([key, value]) => {
            if (key.includes('hash') && (!value || typeof value !== 'string' || value.length !== 64)) {
                throw new ValidationError(`Invalid hash measurement: ${key}`);
            }
        });
    }

    generateReportId() {
        return crypto.randomBytes(16).toString('hex');
    }

    calculateReportHash() {
        const reportData = {
            deviceId: this.deviceId,
            timestamp: this.timestamp.toISOString(),
            nonce: this.nonce,
            measurements: this.measurements,
            attestationLevel: this.attestationLevel,
            platformInfo: this.platformInfo
        };

        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(reportData, Object.keys(reportData).sort()));
        return hash.digest('hex');
    }

    sign(privateKey, algorithm = 'dilithium5') {
        if (!privateKey) {
            throw new Error('Private key required for signing');
        }

        const reportHash = this.calculateReportHash();
        
        switch (algorithm) {
            case 'dilithium5':
                this.signature = this.signWithDilithium(reportHash, privateKey);
                break;
            case 'falcon1024':
                this.signature = this.signWithFalcon(reportHash, privateKey);
                break;
            case 'hybrid':
                this.signature = this.signHybrid(reportHash, privateKey);
                break;
            default:
                throw new Error(`Unsupported signature algorithm: ${algorithm}`);
        }

        this.signatureAlgorithm = algorithm;
        return this.signature;
    }

    signWithDilithium(hash, privateKey) {
        const dilithium = require('../crypto/dilithium/dilithium');
        return dilithium.sign(hash, privateKey);
    }

    signWithFalcon(hash, privateKey) {
        const falcon = require('../crypto/falcon/falcon');
        return falcon.sign(hash, privateKey);
    }

    signHybrid(hash, privateKey) {
        const classicalSig = crypto.sign('sha256', Buffer.from(hash, 'hex'), privateKey.classical);
        const pqcSig = this.signWithDilithium(hash, privateKey.pqc);
        
        return {
            classical: classicalSig.toString('hex'),
            pqc: pqcSig,
            algorithm: 'ecdsa+dilithium5'
        };
    }

    verify(publicKey, algorithm = null) {
        const alg = algorithm || this.signatureAlgorithm;
        const reportHash = this.calculateReportHash();

        try {
            switch (alg) {
                case 'dilithium5':
                    return this.verifyDilithium(reportHash, this.signature, publicKey);
                case 'falcon1024':
                    return this.verifyFalcon(reportHash, this.signature, publicKey);
                case 'hybrid':
                    return this.verifyHybrid(reportHash, this.signature, publicKey);
                default:
                    throw new Error(`Unsupported signature algorithm: ${alg}`);
            }
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    verifyDilithium(hash, signature, publicKey) {
        const dilithium = require('../crypto/dilithium/dilithium');
        return dilithium.verify(hash, signature, publicKey);
    }

    verifyFalcon(hash, signature, publicKey) {
        const falcon = require('../crypto/falcon/falcon');
        return falcon.verify(hash, signature, publicKey);
    }

    verifyHybrid(hash, signature, publicKey) {
        if (!signature.classical || !signature.pqc) {
            return false;
        }

        const classicalValid = crypto.verify(
            'sha256', 
            Buffer.from(hash, 'hex'), 
            publicKey.classical, 
            Buffer.from(signature.classical, 'hex')
        );

        const pqcValid = this.verifyDilithium(hash, signature.pqc, publicKey.pqc);

        return classicalValid && pqcValid;
    }

    assessRisk() {
        let riskScore = 0.0;
        const riskFactors = [];

        if (!this.verificationResult) {
            riskScore += 0.4;
            riskFactors.push('signature_verification_failed');
        }

        const age = Date.now() - this.timestamp.getTime();
        if (age > 300000) { // 5 minutes
            riskScore += 0.2;
            riskFactors.push('stale_report');
        }

        if (!this.measurements.firmware_hash) {
            riskScore += 0.3;
            riskFactors.push('missing_firmware_measurement');
        }

        if (this.measurements.pcr_values && this.measurements.pcr_values.length < 8) {
            riskScore += 0.1;
            riskFactors.push('insufficient_pcr_measurements');
        }

        this.riskAssessment = {
            score: Math.min(riskScore, 1.0),
            level: this.getRiskLevel(riskScore),
            factors: riskFactors,
            assessedAt: new Date()
        };

        return this.riskAssessment;
    }

    getRiskLevel(score) {
        if (score <= 0.2) return 'low';
        if (score <= 0.5) return 'medium';
        if (score <= 0.8) return 'high';
        return 'critical';
    }

    isValid() {
        return this.verificationResult && 
               this.riskAssessment && 
               this.riskAssessment.score < 0.8;
    }

    toJSON() {
        return {
            id: this.id,
            deviceId: this.deviceId,
            timestamp: this.timestamp.toISOString(),
            nonce: this.nonce,
            measurements: this.measurements,
            signature: this.signature,
            signatureAlgorithm: this.signatureAlgorithm,
            attestationLevel: this.attestationLevel,
            platformInfo: this.platformInfo,
            verificationResult: this.verificationResult,
            riskAssessment: this.riskAssessment,
            reportHash: this.calculateReportHash(),
            isValid: this.isValid(),
            createdAt: this.createdAt
        };
    }

    static fromJSON(data) {
        const report = new AttestationReport(data);
        report.verificationResult = data.verificationResult;
        report.riskAssessment = data.riskAssessment;
        return report;
    }

    static generateNonce() {
        return crypto.randomBytes(16).toString('hex');
    }
}

module.exports = AttestationReport;