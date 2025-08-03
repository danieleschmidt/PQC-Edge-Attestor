class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

function validateInput(data, schema) {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        
        // Check required fields
        if (rules.required && (value === undefined || value === null || value === '')) {
            errors.push(`Field '${field}' is required`);
            continue;
        }

        // Skip validation if field is not required and not present
        if (!rules.required && (value === undefined || value === null)) {
            continue;
        }

        // Type validation
        if (rules.type) {
            if (!validateType(value, rules.type)) {
                errors.push(`Field '${field}' must be of type ${rules.type}`);
                continue;
            }
        }

        // Pattern validation
        if (rules.pattern && typeof value === 'string') {
            if (!rules.pattern.test(value)) {
                errors.push(`Field '${field}' does not match required pattern`);
            }
        }

        // Enum validation
        if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`Field '${field}' must be one of: ${rules.enum.join(', ')}`);
        }

        // Length validation
        if (typeof value === 'string') {
            if (rules.minLength && value.length < rules.minLength) {
                errors.push(`Field '${field}' must be at least ${rules.minLength} characters`);
            }
            if (rules.maxLength && value.length > rules.maxLength) {
                errors.push(`Field '${field}' must be at most ${rules.maxLength} characters`);
            }
        }

        // Numeric validation
        if (typeof value === 'number') {
            if (rules.min !== undefined && value < rules.min) {
                errors.push(`Field '${field}' must be at least ${rules.min}`);
            }
            if (rules.max !== undefined && value > rules.max) {
                errors.push(`Field '${field}' must be at most ${rules.max}`);
            }
        }

        // Array validation
        if (Array.isArray(value)) {
            if (rules.minItems && value.length < rules.minItems) {
                errors.push(`Field '${field}' must have at least ${rules.minItems} items`);
            }
            if (rules.maxItems && value.length > rules.maxItems) {
                errors.push(`Field '${field}' must have at most ${rules.maxItems} items`);
            }
            if (rules.items) {
                value.forEach((item, index) => {
                    try {
                        validateInput({ item }, { item: rules.items });
                    } catch (error) {
                        errors.push(`Field '${field}[${index}]': ${error.message}`);
                    }
                });
            }
        }

        // Custom validation function
        if (rules.validate && typeof rules.validate === 'function') {
            try {
                const result = rules.validate(value);
                if (result !== true && typeof result === 'string') {
                    errors.push(`Field '${field}': ${result}`);
                }
            } catch (error) {
                errors.push(`Field '${field}': ${error.message}`);
            }
        }
    }

    if (errors.length > 0) {
        throw new ValidationError(errors.join('; '));
    }

    return true;
}

function validateType(value, expectedType) {
    switch (expectedType) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && !isNaN(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'array':
            return Array.isArray(value);
        case 'object':
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        case 'date':
            return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
        default:
            return true;
    }
}

function validateDeviceId(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') {
        throw new ValidationError('Device ID must be a string');
    }
    
    if (!/^[a-f0-9]{32}$/.test(deviceId)) {
        throw new ValidationError('Device ID must be a 32-character hexadecimal string');
    }
    
    return true;
}

function validateSerialNumber(serialNumber) {
    if (!serialNumber || typeof serialNumber !== 'string') {
        throw new ValidationError('Serial number must be a string');
    }
    
    if (serialNumber.length < 8 || serialNumber.length > 64) {
        throw new ValidationError('Serial number must be between 8 and 64 characters');
    }
    
    if (!/^[A-Za-z0-9\-_]+$/.test(serialNumber)) {
        throw new ValidationError('Serial number contains invalid characters');
    }
    
    return true;
}

function validateFirmwareVersion(version) {
    if (!version || typeof version !== 'string') {
        throw new ValidationError('Firmware version must be a string');
    }
    
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(version)) {
        throw new ValidationError('Firmware version must follow semantic versioning (x.y.z or x.y.z-suffix)');
    }
    
    return true;
}

function validateCryptoAlgorithm(algorithm, type) {
    const supportedAlgorithms = {
        kem: ['kyber768', 'kyber1024'],
        signature: ['dilithium3', 'dilithium5', 'falcon512', 'falcon1024'],
        hash: ['sha256', 'sha384', 'sha3-256', 'sha3-384']
    };
    
    if (!type || !supportedAlgorithms[type]) {
        throw new ValidationError(`Invalid algorithm type: ${type}`);
    }
    
    if (!algorithm || !supportedAlgorithms[type].includes(algorithm)) {
        throw new ValidationError(`Unsupported ${type} algorithm: ${algorithm}`);
    }
    
    return true;
}

function validateAttestationReport(report) {
    const schema = {
        deviceId: { 
            type: 'string', 
            required: true, 
            pattern: /^[a-f0-9]{32}$/,
            validate: validateDeviceId
        },
        timestamp: { 
            type: 'date', 
            required: true,
            validate: (value) => {
                const date = new Date(value);
                const now = new Date();
                const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
                
                if (date > now) {
                    return 'Timestamp cannot be in the future';
                }
                if (date < fiveMinutesAgo) {
                    return 'Timestamp is too old (more than 5 minutes)';
                }
                return true;
            }
        },
        nonce: { 
            type: 'string', 
            required: true, 
            minLength: 16, 
            maxLength: 64,
            pattern: /^[a-f0-9]+$/
        },
        measurements: { 
            type: 'object', 
            required: true,
            validate: validateMeasurements
        },
        signature: { 
            type: 'string', 
            required: true, 
            minLength: 32 
        },
        signatureAlgorithm: { 
            type: 'string', 
            enum: ['dilithium3', 'dilithium5', 'falcon512', 'falcon1024', 'hybrid'] 
        }
    };

    return validateInput(report, schema);
}

function validateMeasurements(measurements) {
    const requiredMeasurements = [
        'firmware_hash',
        'bootloader_hash',
        'configuration_hash'
    ];

    for (const measurement of requiredMeasurements) {
        if (!measurements[measurement]) {
            return `Missing required measurement: ${measurement}`;
        }
        
        if (measurement.includes('hash')) {
            if (typeof measurements[measurement] !== 'string' || 
                !/^[a-f0-9]{64}$/.test(measurements[measurement])) {
                return `Invalid hash format for ${measurement}`;
            }
        }
    }

    if (measurements.pcr_values) {
        if (!Array.isArray(measurements.pcr_values)) {
            return 'PCR values must be an array';
        }
        
        for (const pcr of measurements.pcr_values) {
            if (!pcr.index || !pcr.value || !pcr.algorithm) {
                return 'PCR entry must have index, value, and algorithm';
            }
            
            if (typeof pcr.index !== 'number' || pcr.index < 0 || pcr.index > 23) {
                return 'PCR index must be between 0 and 23';
            }
            
            if (!/^[a-f0-9]{64}$/.test(pcr.value)) {
                return 'PCR value must be a 64-character hex string';
            }
        }
    }

    return true;
}

function validateNetworkAddress(address) {
    if (!address || typeof address !== 'string') {
        throw new ValidationError('Network address must be a string');
    }

    // IPv4 validation
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 validation (simplified)
    const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    // Hostname validation
    const hostnamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!ipv4Pattern.test(address) && !ipv6Pattern.test(address) && !hostnamePattern.test(address)) {
        throw new ValidationError('Invalid network address format');
    }

    return true;
}

function validatePortNumber(port) {
    if (typeof port !== 'number' || !Number.isInteger(port)) {
        throw new ValidationError('Port must be an integer');
    }
    
    if (port < 1 || port > 65535) {
        throw new ValidationError('Port must be between 1 and 65535');
    }
    
    return true;
}

function validateCertificate(certificate) {
    if (!certificate || typeof certificate !== 'string') {
        throw new ValidationError('Certificate must be a string');
    }
    
    if (!certificate.startsWith('-----BEGIN CERTIFICATE-----') || 
        !certificate.endsWith('-----END CERTIFICATE-----')) {
        throw new ValidationError('Invalid certificate format');
    }
    
    return true;
}

function sanitizeInput(input) {
    if (typeof input === 'string') {
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/['"]/g, '')  // Remove quotes
            .trim();
    }
    
    if (typeof input === 'object' && input !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(input)) {
            sanitized[key] = sanitizeInput(value);
        }
        return sanitized;
    }
    
    return input;
}

function validateSecurityLevel(level) {
    const validLevels = [1, 3, 5];
    
    if (!validLevels.includes(level)) {
        throw new ValidationError(`Security level must be one of: ${validLevels.join(', ')}`);
    }
    
    return true;
}

module.exports = {
    ValidationError,
    validateInput,
    validateType,
    validateDeviceId,
    validateSerialNumber,
    validateFirmwareVersion,
    validateCryptoAlgorithm,
    validateAttestationReport,
    validateMeasurements,
    validateNetworkAddress,
    validatePortNumber,
    validateCertificate,
    validateSecurityLevel,
    sanitizeInput
};