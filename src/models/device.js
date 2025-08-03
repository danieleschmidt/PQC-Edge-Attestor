/**
 * @file device.js
 * @brief Device model with schema validation and business logic
 * 
 * This module defines the Device model for storing IoT device information,
 * including cryptographic keys, attestation state, and hardware metadata.
 */

const { DataTypes, Model } = require('sequelize');
const crypto = require('crypto');
const { deviceSchema } = require('./schemas/deviceSchema');

class Device extends Model {
    /**
     * Initialize the Device model with database connection
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

            // Device identification
            serialNumber: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
                validate: {
                    notEmpty: true,
                    len: [1, 64]
                }
            },

            deviceType: {
                type: DataTypes.ENUM(
                    'smart_meter',
                    'ev_charger', 
                    'grid_controller',
                    'iot_gateway',
                    'sensor_node',
                    'development_board'
                ),
                allowNull: false,
                defaultValue: 'smart_meter'
            },

            // Hardware information
            hardwareVersion: {
                type: DataTypes.STRING(32),
                allowNull: false,
                defaultValue: '1.0'
            },

            firmwareVersion: {
                type: DataTypes.STRING(32),
                allowNull: false,
                defaultValue: '1.0.0'
            },

            manufacturerId: {
                type: DataTypes.STRING(64),
                allowNull: true
            },

            modelId: {
                type: DataTypes.STRING(64),
                allowNull: true
            },

            // Cryptographic configuration
            pqcAlgorithms: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {
                    kem: 'kyber1024',
                    signature: 'dilithium5',
                    alternative_signature: 'falcon1024'
                },
                validate: {
                    isValidAlgorithms(value) {
                        const validKems = ['kyber512', 'kyber768', 'kyber1024'];
                        const validSigs = ['dilithium2', 'dilithium3', 'dilithium5'];
                        const validAltSigs = ['falcon512', 'falcon1024'];

                        if (!validKems.includes(value.kem)) {
                            throw new Error('Invalid KEM algorithm');
                        }
                        if (!validSigs.includes(value.signature)) {
                            throw new Error('Invalid signature algorithm');
                        }
                        if (value.alternative_signature && !validAltSigs.includes(value.alternative_signature)) {
                            throw new Error('Invalid alternative signature algorithm');
                        }
                    }
                }
            },

            securityLevel: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 5,
                validate: {
                    isIn: [[1, 3, 5]] // NIST security levels
                }
            },

            // Public key storage (encrypted in production)
            publicKeyDilithium: {
                type: DataTypes.BLOB,
                allowNull: true
            },

            publicKeyKyber: {
                type: DataTypes.BLOB,
                allowNull: true
            },

            // Device certificate
            deviceCertificate: {
                type: DataTypes.BLOB,
                allowNull: true
            },

            certificateExpiry: {
                type: DataTypes.DATE,
                allowNull: true
            },

            // Attestation configuration
            attestationEnabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },

            attestationInterval: {
                type: DataTypes.INTEGER, // minutes
                allowNull: false,
                defaultValue: 60,
                validate: {
                    min: 1,
                    max: 1440 // max 24 hours
                }
            },

            continuousMonitoring: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },

            // Device status
            status: {
                type: DataTypes.ENUM(
                    'provisioning',
                    'active',
                    'inactive', 
                    'maintenance',
                    'compromised',
                    'decommissioned'
                ),
                allowNull: false,
                defaultValue: 'provisioning'
            },

            lastSeen: {
                type: DataTypes.DATE,
                allowNull: true
            },

            lastAttestationTime: {
                type: DataTypes.DATE,
                allowNull: true
            },

            lastAttestationResult: {
                type: DataTypes.ENUM('success', 'failure', 'warning'),
                allowNull: true
            },

            trustLevel: {
                type: DataTypes.ENUM('unknown', 'low', 'medium', 'high', 'critical'),
                allowNull: false,
                defaultValue: 'unknown'
            },

            // Network configuration
            networkConfig: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: {
                    interfaces: [],
                    protocols: ['mqtt', 'coap'],
                    encryption: 'tls13_pqc'
                }
            },

            // Deployment information
            deploymentLocation: {
                type: DataTypes.STRING(256),
                allowNull: true
            },

            deploymentZone: {
                type: DataTypes.STRING(64),
                allowNull: true
            },

            organizationId: {
                type: DataTypes.UUID,
                allowNull: true
            },

            // Metadata
            tags: {
                type: DataTypes.JSON,
                allowNull: true,
                defaultValue: {}
            },

            notes: {
                type: DataTypes.TEXT,
                allowNull: true
            }
        }, {
            sequelize,
            modelName: 'Device',
            tableName: 'devices',
            timestamps: true,
            paranoid: true, // Soft delete
            indexes: [
                {
                    unique: true,
                    fields: ['serialNumber']
                },
                {
                    fields: ['deviceType']
                },
                {
                    fields: ['status']
                },
                {
                    fields: ['trustLevel']
                },
                {
                    fields: ['organizationId']
                },
                {
                    fields: ['lastSeen']
                }
            ],
            hooks: {
                beforeValidate: (device, options) => {
                    // Ensure serial number is uppercase and trimmed
                    if (device.serialNumber) {
                        device.serialNumber = device.serialNumber.trim().toUpperCase();
                    }
                },
                
                beforeCreate: (device, options) => {
                    // Set initial timestamps
                    device.lastSeen = new Date();
                },

                afterCreate: (device, options) => {
                    console.log(`Device created: ${device.serialNumber}`);
                }
            }
        });
    }

    /**
     * Define associations with other models
     * @param {Object} models - All defined models
     */
    static associate(models) {
        // Device has many attestation reports
        Device.hasMany(models.AttestationReport, {
            foreignKey: 'deviceId',
            as: 'attestationReports'
        });

        // Device has many firmware updates
        Device.hasMany(models.FirmwareUpdate, {
            foreignKey: 'deviceId',
            as: 'firmwareUpdates'
        });

        // Device belongs to an organization
        Device.belongsTo(models.Organization, {
            foreignKey: 'organizationId',
            as: 'organization'
        });

        // Device has many security events
        Device.hasMany(models.SecurityEvent, {
            foreignKey: 'deviceId',
            as: 'securityEvents'
        });
    }

    /**
     * Get devices by status
     * @param {string} status - Device status
     * @returns {Promise<Device[]>} Array of devices
     */
    static async findByStatus(status) {
        return await Device.findAll({
            where: { status },
            order: [['lastSeen', 'DESC']]
        });
    }

    /**
     * Get devices requiring attestation
     * @returns {Promise<Device[]>} Array of devices
     */
    static async findRequiringAttestation() {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

        return await Device.findAll({
            where: {
                attestationEnabled: true,
                status: 'active',
                [Op.or]: [
                    { lastAttestationTime: null },
                    { lastAttestationTime: { [Op.lt]: cutoffTime } }
                ]
            },
            order: [['lastAttestationTime', 'ASC']]
        });
    }

    /**
     * Update device status and last seen time
     * @param {string} status - New status
     * @returns {Promise<Device>} Updated device
     */
    async updateStatus(status) {
        this.status = status;
        this.lastSeen = new Date();
        
        if (status === 'compromised') {
            this.trustLevel = 'low';
            this.attestationEnabled = false;
            
            // Log security event
            await this.createSecurityEvent({
                eventType: 'device_compromised',
                severity: 'critical',
                description: 'Device status changed to compromised'
            });
        }

        return await this.save();
    }

    /**
     * Record successful attestation
     * @param {Object} attestationData - Attestation result data
     * @returns {Promise<Device>} Updated device
     */
    async recordAttestation(attestationData) {
        this.lastAttestationTime = new Date();
        this.lastAttestationResult = attestationData.result;
        this.trustLevel = attestationData.trustLevel;
        this.lastSeen = new Date();

        // Update status based on attestation result
        if (attestationData.result === 'failure') {
            if (this.status === 'active') {
                this.status = 'maintenance';
            }
        } else if (attestationData.result === 'success' && this.status === 'maintenance') {
            this.status = 'active';
        }

        return await this.save();
    }

    /**
     * Store device public keys
     * @param {Object} keys - Public keys object
     * @returns {Promise<Device>} Updated device
     */
    async storePublicKeys(keys) {
        if (keys.dilithium) {
            this.publicKeyDilithium = Buffer.from(keys.dilithium);
        }
        if (keys.kyber) {
            this.publicKeyKyber = Buffer.from(keys.kyber);
        }

        return await this.save();
    }

    /**
     * Get device public keys
     * @returns {Object} Public keys object
     */
    getPublicKeys() {
        return {
            dilithium: this.publicKeyDilithium ? this.publicKeyDilithium : null,
            kyber: this.publicKeyKyber ? this.publicKeyKyber : null
        };
    }

    /**
     * Check if device certificate is valid
     * @returns {boolean} True if certificate is valid
     */
    isCertificateValid() {
        if (!this.deviceCertificate || !this.certificateExpiry) {
            return false;
        }

        return new Date() < this.certificateExpiry;
    }

    /**
     * Get device security posture
     * @returns {Object} Security posture assessment
     */
    getSecurityPosture() {
        const now = new Date();
        const assessments = {
            overall: 'unknown',
            factors: {}
        };

        // Certificate status
        assessments.factors.certificate = this.isCertificateValid() ? 'good' : 'poor';

        // Attestation recency
        if (this.lastAttestationTime) {
            const hoursSinceAttestation = (now - this.lastAttestationTime) / (1000 * 60 * 60);
            assessments.factors.attestation_recency = hoursSinceAttestation < 24 ? 'good' : 'poor';
        } else {
            assessments.factors.attestation_recency = 'poor';
        }

        // Attestation results
        assessments.factors.attestation_result = this.lastAttestationResult === 'success' ? 'good' : 'poor';

        // Device activity
        if (this.lastSeen) {
            const hoursSinceSeen = (now - this.lastSeen) / (1000 * 60 * 60);
            assessments.factors.activity = hoursSinceSeen < 2 ? 'good' : 'poor';
        } else {
            assessments.factors.activity = 'poor';
        }

        // Calculate overall score
        const goodFactors = Object.values(assessments.factors).filter(f => f === 'good').length;
        const totalFactors = Object.keys(assessments.factors).length;
        const score = goodFactors / totalFactors;

        if (score >= 0.8) {
            assessments.overall = 'excellent';
        } else if (score >= 0.6) {
            assessments.overall = 'good';
        } else if (score >= 0.4) {
            assessments.overall = 'fair';
        } else {
            assessments.overall = 'poor';
        }

        return assessments;
    }

    /**
     * Generate device hash for integrity checking
     * @returns {string} SHA-256 hash of device data
     */
    generateHash() {
        const hashData = {
            serialNumber: this.serialNumber,
            deviceType: this.deviceType,
            hardwareVersion: this.hardwareVersion,
            publicKeyDilithium: this.publicKeyDilithium?.toString('hex'),
            publicKeyKyber: this.publicKeyKyber?.toString('hex')
        };

        return crypto.createHash('sha256')
            .update(JSON.stringify(hashData))
            .digest('hex');
    }

    /**
     * Create security event for this device
     * @param {Object} eventData - Security event data
     * @returns {Promise<SecurityEvent>} Created security event
     */
    async createSecurityEvent(eventData) {
        const SecurityEvent = this.constructor.sequelize.models.SecurityEvent;
        return await SecurityEvent.create({
            deviceId: this.id,
            ...eventData
        });
    }

    /**
     * Get recent security events
     * @param {number} limit - Maximum number of events to return
     * @returns {Promise<SecurityEvent[]>} Array of security events
     */
    async getRecentSecurityEvents(limit = 10) {
        return await this.getSecurityEvents({
            limit,
            order: [['createdAt', 'DESC']]
        });
    }

    /**
     * Validate device configuration
     * @returns {Object} Validation result
     */
    validateConfiguration() {
        const errors = [];
        const warnings = [];

        // Check required fields
        if (!this.serialNumber) {
            errors.push('Serial number is required');
        }

        if (!this.deviceType) {
            errors.push('Device type is required');
        }

        // Check cryptographic configuration
        if (!this.pqcAlgorithms || !this.pqcAlgorithms.kem || !this.pqcAlgorithms.signature) {
            errors.push('PQC algorithms must be configured');
        }

        // Check security level alignment
        if (this.securityLevel === 5 && 
            (!this.pqcAlgorithms.kem.includes('1024') || !this.pqcAlgorithms.signature.includes('5'))) {
            warnings.push('Security level 5 should use strongest algorithms');
        }

        // Check certificate expiry
        if (this.certificateExpiry && this.certificateExpiry < new Date()) {
            warnings.push('Device certificate has expired');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Convert to JSON with sensitive data excluded
     * @returns {Object} Safe JSON representation
     */
    toSafeJSON() {
        const json = this.toJSON();
        
        // Remove sensitive fields
        delete json.publicKeyDilithium;
        delete json.publicKeyKyber;
        delete json.deviceCertificate;
        
        // Add computed fields
        json.certificateValid = this.isCertificateValid();
        json.securityPosture = this.getSecurityPosture();
        json.deviceHash = this.generateHash();
        
        return json;
    }
}

module.exports = Device;