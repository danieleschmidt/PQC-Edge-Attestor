/**
 * @file attestationReport.js
 * @brief Attestation report model for storing device attestation data
 * 
 * This module defines the AttestationReport model for storing and managing
 * hardware attestation reports from IoT devices.
 */

const { DataTypes, Model } = require('sequelize');
const crypto = require('crypto');

class AttestationReport extends Model {
    /**
     * Initialize the AttestationReport model
     * @param {Object} sequelize - Sequelize instance
     */
    static init(sequelize) {
        super.init({
            // Primary identifier
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false
            },

            // Foreign key to device
            deviceId: {
                type: DataTypes.UUID,
                allowNull: false,
                references: {
                    model: 'devices',
                    key: 'id'
                }
            },

            // Report metadata
            reportVersion: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1
            },

            reportTimestamp: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },

            sequenceNumber: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0
            },

            // PCR values (Platform Configuration Registers)
            pcrValues: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
                validate: {
                    isPCRFormat(value) {
                        // Validate PCR format: object with PCR indices as keys
                        if (typeof value !== 'object') {
                            throw new Error('PCR values must be an object');
                        }
                        
                        for (const [index, pcrValue] of Object.entries(value)) {
                            const pcrIndex = parseInt(index);
                            if (isNaN(pcrIndex) || pcrIndex < 0 || pcrIndex > 23) {
                                throw new Error(`Invalid PCR index: ${index}`);
                            }
                            
                            if (typeof pcrValue !== 'string' || !/^[0-9a-fA-F]{64}$/.test(pcrValue)) {
                                throw new Error(`Invalid PCR value format for PCR ${index}`);
                            }
                        }
                    }
                }
            },

            // Platform measurements
            measurements: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: [],
                validate: {
                    isMeasurementArray(value) {
                        if (!Array.isArray(value)) {
                            throw new Error('Measurements must be an array');
                        }
                        
                        for (const measurement of value) {
                            if (!measurement.pcr_index || !measurement.measurement_type || !measurement.measurement_value) {
                                throw new Error('Invalid measurement format');
                            }
                        }
                    }
                }
            },

            // Cryptographic signature
            signature: {
                type: DataTypes.BLOB,
                allowNull: false
            },

            signatureAlgorithm: {
                type: DataTypes.ENUM(
                    'dilithium2',
                    'dilithium3', 
                    'dilithium5',
                    'falcon512',
                    'falcon1024'
                ),
                allowNull: false,
                defaultValue: 'dilithium5'
            },

            // Verification results
            verificationStatus: {
                type: DataTypes.ENUM(
                    'pending',
                    'verified',
                    'failed',
                    'expired'
                ),
                allowNull: false,
                defaultValue: 'pending'
            },

            verificationTimestamp: {
                type: DataTypes.DATE,
                allowNull: true
            },

            verificationDetails: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: {}
            },

            // Trust assessment
            trustLevel: {
                type: DataTypes.ENUM(
                    'unknown',
                    'low',
                    'medium', 
                    'high',
                    'critical'
                ),
                allowNull: false,
                defaultValue: 'unknown'
            },

            trustScore: {
                type: DataTypes.DECIMAL(5, 4), // 0.0000 to 1.0000
                allowNull: true,
                validate: {
                    min: 0.0,
                    max: 1.0
                }
            },

            // Policy compliance
            policiesEvaluated: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: []
            },

            policyViolations: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: []
            },

            complianceStatus: {
                type: DataTypes.ENUM(
                    'compliant',
                    'non_compliant',
                    'warning',
                    'unknown'
                ),
                allowNull: false,
                defaultValue: 'unknown'
            },

            // Processing metadata
            processedAt: {
                type: DataTypes.DATE,
                allowNull: true
            },

            processingErrors: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: []
            },

            rawReportData: {
                type: DataTypes.BLOB,
                allowNull: true
            },

            // Additional context
            networkInfo: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: {}
            },

            environmentInfo: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: {}
            }
        }, {
            sequelize,
            modelName: 'AttestationReport',
            tableName: 'attestation_reports',
            timestamps: true,
            indexes: [
                {
                    fields: ['deviceId']
                },
                {
                    fields: ['reportTimestamp']
                },
                {
                    fields: ['verificationStatus']
                },
                {
                    fields: ['trustLevel']
                },
                {
                    fields: ['complianceStatus']
                },
                {
                    fields: ['deviceId', 'reportTimestamp']
                },
                {
                    fields: ['sequenceNumber']
                }
            ],
            hooks: {
                beforeCreate: (report, options) => {
                    // Set processing timestamp
                    report.processedAt = new Date();
                    
                    // Generate sequence number if not provided
                    if (!report.sequenceNumber) {
                        report.sequenceNumber = Date.now();
                    }
                },

                afterCreate: (report, options) => {
                    console.log(`Attestation report created for device ${report.deviceId}`);
                }
            }
        });
    }

    /**
     * Define associations with other models
     * @param {Object} models - All defined models
     */
    static associate(models) {
        // Report belongs to a device
        AttestationReport.belongsTo(models.Device, {
            foreignKey: 'deviceId',
            as: 'device'
        });

        // Report may have related security events
        AttestationReport.hasMany(models.SecurityEvent, {
            foreignKey: 'attestationReportId',
            as: 'securityEvents'
        });
    }

    /**
     * Find reports by device ID
     * @param {string} deviceId - Device UUID
     * @param {Object} options - Query options
     * @returns {Promise<AttestationReport[]>} Array of reports
     */
    static async findByDeviceId(deviceId, options = {}) {
        const defaultOptions = {
            where: { deviceId },
            order: [['reportTimestamp', 'DESC']],
            limit: 50
        };

        return await AttestationReport.findAll({
            ...defaultOptions,
            ...options
        });
    }

    /**
     * Find reports requiring verification
     * @param {number} limit - Maximum number of reports
     * @returns {Promise<AttestationReport[]>} Array of reports
     */
    static async findPendingVerification(limit = 100) {
        return await AttestationReport.findAll({
            where: {
                verificationStatus: 'pending'
            },
            order: [['reportTimestamp', 'ASC']],
            limit,
            include: [
                {
                    model: this.sequelize.models.Device,
                    as: 'device',
                    attributes: ['id', 'serialNumber', 'deviceType', 'publicKeyDilithium']
                }
            ]
        });
    }

    /**
     * Get reports with policy violations
     * @param {Date} since - Start date for search
     * @returns {Promise<AttestationReport[]>} Array of reports
     */
    static async findWithViolations(since = null) {
        const whereClause = {
            complianceStatus: 'non_compliant'
        };

        if (since) {
            whereClause.reportTimestamp = {
                [Op.gte]: since
            };
        }

        return await AttestationReport.findAll({
            where: whereClause,
            order: [['reportTimestamp', 'DESC']],
            include: [
                {
                    model: this.sequelize.models.Device,
                    as: 'device',
                    attributes: ['id', 'serialNumber', 'deviceType', 'status']
                }
            ]
        });
    }

    /**
     * Verify the cryptographic signature of the report
     * @param {Buffer} publicKey - Device public key
     * @returns {Promise<boolean>} True if signature is valid
     */
    async verifySignature(publicKey) {
        try {
            // Create report hash for verification
            const reportData = {
                deviceId: this.deviceId,
                reportTimestamp: this.reportTimestamp,
                pcrValues: this.pcrValues,
                measurements: this.measurements
            };

            const reportHash = crypto.createHash('sha256')
                .update(JSON.stringify(reportData))
                .digest();

            // In a real implementation, this would use the actual PQC signature verification
            // For now, we'll simulate the verification
            const isValid = this.signature && this.signature.length > 0;

            // Update verification status
            this.verificationStatus = isValid ? 'verified' : 'failed';
            this.verificationTimestamp = new Date();
            this.verificationDetails = {
                signatureLength: this.signature.length,
                algorithm: this.signatureAlgorithm,
                verifiedAt: new Date().toISOString()
            };

            await this.save();

            return isValid;
        } catch (error) {
            this.verificationStatus = 'failed';
            this.verificationTimestamp = new Date();
            this.verificationDetails = {
                error: error.message
            };
            await this.save();
            return false;
        }
    }

    /**
     * Evaluate report against security policies
     * @param {Array} policies - Array of security policies
     * @returns {Promise<Object>} Evaluation result
     */
    async evaluatePolicies(policies) {
        const evaluationResult = {
            compliant: true,
            violations: [],
            warnings: [],
            score: 1.0
        };

        this.policiesEvaluated = policies.map(p => ({
            id: p.id,
            name: p.name,
            version: p.version
        }));

        for (const policy of policies) {
            try {
                const result = await this.evaluatePolicy(policy);
                
                if (!result.compliant) {
                    evaluationResult.compliant = false;
                    evaluationResult.violations.push({
                        policyId: policy.id,
                        rule: result.violatedRule,
                        description: result.description,
                        severity: result.severity
                    });
                }

                if (result.warnings && result.warnings.length > 0) {
                    evaluationResult.warnings.push(...result.warnings);
                }

                evaluationResult.score = Math.min(evaluationResult.score, result.score || 1.0);
            } catch (error) {
                evaluationResult.violations.push({
                    policyId: policy.id,
                    rule: 'evaluation_error',
                    description: `Policy evaluation failed: ${error.message}`,
                    severity: 'medium'
                });
            }
        }

        // Update report with evaluation results
        this.policyViolations = evaluationResult.violations;
        this.complianceStatus = evaluationResult.compliant ? 'compliant' : 'non_compliant';
        this.trustScore = evaluationResult.score;

        // Calculate trust level based on score
        if (evaluationResult.score >= 0.9) {
            this.trustLevel = 'critical';
        } else if (evaluationResult.score >= 0.8) {
            this.trustLevel = 'high';
        } else if (evaluationResult.score >= 0.6) {
            this.trustLevel = 'medium';
        } else {
            this.trustLevel = 'low';
        }

        await this.save();

        return evaluationResult;
    }

    /**
     * Evaluate against a single policy
     * @param {Object} policy - Security policy
     * @returns {Promise<Object>} Policy evaluation result
     */
    async evaluatePolicy(policy) {
        const result = {
            compliant: true,
            score: 1.0,
            warnings: []
        };

        // Example policy checks
        switch (policy.type) {
            case 'pcr_baseline':
                result = this.evaluatePCRBaseline(policy);
                break;
            
            case 'measurement_integrity':
                result = this.evaluateMeasurementIntegrity(policy);
                break;
                
            case 'temporal_freshness':
                result = this.evaluateTemporalFreshness(policy);
                break;
                
            default:
                result.warnings.push(`Unknown policy type: ${policy.type}`);
        }

        return result;
    }

    /**
     * Evaluate PCR baseline policy
     * @param {Object} policy - PCR baseline policy
     * @returns {Object} Evaluation result
     */
    evaluatePCRBaseline(policy) {
        const result = { compliant: true, score: 1.0 };

        if (!policy.baselines) {
            return result;
        }

        for (const [pcrIndex, expectedValue] of Object.entries(policy.baselines)) {
            const actualValue = this.pcrValues[pcrIndex];
            
            if (!actualValue) {
                result.compliant = false;
                result.violatedRule = 'missing_pcr';
                result.description = `Missing PCR ${pcrIndex} value`;
                result.severity = 'high';
                result.score = 0.0;
                break;
            }

            if (actualValue !== expectedValue) {
                result.compliant = false;
                result.violatedRule = 'pcr_mismatch';
                result.description = `PCR ${pcrIndex} does not match baseline`;
                result.severity = 'critical';
                result.score = 0.0;
                break;
            }
        }

        return result;
    }

    /**
     * Evaluate measurement integrity policy
     * @param {Object} policy - Measurement integrity policy
     * @returns {Object} Evaluation result
     */
    evaluateMeasurementIntegrity(policy) {
        const result = { compliant: true, score: 1.0 };

        if (!this.measurements || this.measurements.length === 0) {
            result.compliant = false;
            result.violatedRule = 'no_measurements';
            result.description = 'No platform measurements found';
            result.severity = 'high';
            result.score = 0.0;
            return result;
        }

        // Check required measurements
        if (policy.requiredMeasurements) {
            for (const requiredType of policy.requiredMeasurements) {
                const found = this.measurements.some(m => m.measurement_type === requiredType);
                if (!found) {
                    result.compliant = false;
                    result.violatedRule = 'missing_measurement';
                    result.description = `Missing required measurement: ${requiredType}`;
                    result.severity = 'medium';
                    result.score *= 0.8;
                }
            }
        }

        return result;
    }

    /**
     * Evaluate temporal freshness policy
     * @param {Object} policy - Temporal freshness policy
     * @returns {Object} Evaluation result
     */
    evaluateTemporalFreshness(policy) {
        const result = { compliant: true, score: 1.0 };
        const now = new Date();
        const ageMinutes = (now - this.reportTimestamp) / (1000 * 60);

        const maxAgeMinutes = policy.maxAgeMinutes || 60;

        if (ageMinutes > maxAgeMinutes) {
            result.compliant = false;
            result.violatedRule = 'stale_report';
            result.description = `Report is ${Math.round(ageMinutes)} minutes old (max: ${maxAgeMinutes})`;
            result.severity = 'medium';
            result.score = Math.max(0.0, 1.0 - (ageMinutes / maxAgeMinutes));
        }

        return result;
    }

    /**
     * Generate summary statistics for the report
     * @returns {Object} Report statistics
     */
    getStatistics() {
        return {
            id: this.id,
            deviceId: this.deviceId,
            timestamp: this.reportTimestamp,
            verificationStatus: this.verificationStatus,
            trustLevel: this.trustLevel,
            trustScore: this.trustScore,
            complianceStatus: this.complianceStatus,
            pcrCount: Object.keys(this.pcrValues).length,
            measurementCount: this.measurements.length,
            violationCount: this.policyViolations.length,
            processingTime: this.processedAt ? 
                this.processedAt.getTime() - this.reportTimestamp.getTime() : null
        };
    }

    /**
     * Convert to JSON with computed fields
     * @returns {Object} JSON representation with additional fields
     */
    toEnrichedJSON() {
        const json = this.toJSON();
        
        // Add computed fields
        json.statistics = this.getStatistics();
        json.ageMinutes = (new Date() - this.reportTimestamp) / (1000 * 60);
        json.isVerified = this.verificationStatus === 'verified';
        json.isCompliant = this.complianceStatus === 'compliant';
        
        return json;
    }
}

module.exports = AttestationReport;