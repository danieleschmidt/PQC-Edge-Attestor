const winston = require('winston');
const path = require('path');

class SecurityLogger {
    constructor(options = {}) {
        this.options = {
            level: options.level || 'info',
            logDir: options.logDir || './logs',
            maxFileSize: options.maxFileSize || '10m',
            maxFiles: options.maxFiles || 5,
            enableConsole: options.enableConsole !== false,
            enableFile: options.enableFile !== false,
            enableSecurity: options.enableSecurity !== false,
            enableAudit: options.enableAudit !== false,
            ...options
        };

        this.createTransports();
        this.createLogger();
    }

    createTransports() {
        this.transports = [];

        // Console transport
        if (this.options.enableConsole) {
            this.transports.push(
                new winston.transports.Console({
                    level: this.options.level,
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.timestamp(),
                        winston.format.printf(this.consoleFormat)
                    )
                })
            );
        }

        // File transport for general logs
        if (this.options.enableFile) {
            this.transports.push(
                new winston.transports.File({
                    filename: path.join(this.options.logDir, 'application.log'),
                    level: this.options.level,
                    maxsize: this.options.maxFileSize,
                    maxFiles: this.options.maxFiles,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json()
                    )
                })
            );
        }

        // Security events transport
        if (this.options.enableSecurity) {
            this.transports.push(
                new winston.transports.File({
                    filename: path.join(this.options.logDir, 'security.log'),
                    level: 'warn',
                    maxsize: this.options.maxFileSize,
                    maxFiles: this.options.maxFiles,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json(),
                        winston.format.label({ label: 'SECURITY' })
                    )
                })
            );
        }

        // Audit trail transport
        if (this.options.enableAudit) {
            this.transports.push(
                new winston.transports.File({
                    filename: path.join(this.options.logDir, 'audit.log'),
                    level: 'info',
                    maxsize: this.options.maxFileSize,
                    maxFiles: this.options.maxFiles,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json(),
                        winston.format.label({ label: 'AUDIT' })
                    )
                })
            );
        }
    }

    createLogger() {
        this.logger = winston.createLogger({
            level: this.options.level,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'pqc-edge-attestor' },
            transports: this.transports,
            exitOnError: false
        });

        // Handle uncaught exceptions and rejections
        this.logger.exceptions.handle(
            new winston.transports.File({
                filename: path.join(this.options.logDir, 'exceptions.log'),
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        );

        this.logger.rejections.handle(
            new winston.transports.File({
                filename: path.join(this.options.logDir, 'rejections.log'),
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        );
    }

    consoleFormat(info) {
        const { timestamp, level, message, ...meta } = info;
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
    }

    // Standard logging methods
    debug(message, meta = {}) {
        this.logger.debug(message, this.sanitizeMeta(meta));
    }

    info(message, meta = {}) {
        this.logger.info(message, this.sanitizeMeta(meta));
    }

    warn(message, meta = {}) {
        this.logger.warn(message, this.sanitizeMeta(meta));
    }

    error(message, meta = {}) {
        this.logger.error(message, this.sanitizeMeta(meta));
    }

    // Security-specific logging methods
    securityEvent(event, details = {}) {
        const securityLog = {
            event,
            timestamp: new Date().toISOString(),
            severity: details.severity || 'medium',
            source: details.source || 'unknown',
            userId: details.userId,
            deviceId: details.deviceId,
            ipAddress: details.ipAddress,
            userAgent: details.userAgent,
            details: this.sanitizeMeta(details.details || {})
        };

        this.logger.warn('Security Event', { security: securityLog });
    }

    // Audit trail logging
    auditLog(action, details = {}) {
        const auditEntry = {
            action,
            timestamp: new Date().toISOString(),
            userId: details.userId,
            deviceId: details.deviceId,
            resourceId: details.resourceId,
            resourceType: details.resourceType,
            result: details.result || 'success',
            ipAddress: details.ipAddress,
            details: this.sanitizeMeta(details.details || {})
        };

        this.logger.info('Audit Entry', { audit: auditEntry });
    }

    // Authentication events
    authSuccess(userId, details = {}) {
        this.securityEvent('auth_success', {
            severity: 'low',
            userId,
            ...details
        });
    }

    authFailure(userId, reason, details = {}) {
        this.securityEvent('auth_failure', {
            severity: 'high',
            userId,
            reason,
            ...details
        });
    }

    // Attestation events
    attestationSuccess(deviceId, details = {}) {
        this.auditLog('attestation_verify', {
            deviceId,
            result: 'success',
            ...details
        });
    }

    attestationFailure(deviceId, reason, details = {}) {
        this.securityEvent('attestation_failure', {
            severity: 'high',
            deviceId,
            reason,
            ...details
        });
    }

    // Cryptographic events
    cryptoOperation(operation, algorithm, details = {}) {
        this.auditLog('crypto_operation', {
            operation,
            algorithm,
            ...details
        });
    }

    cryptoError(operation, algorithm, error, details = {}) {
        this.securityEvent('crypto_error', {
            severity: 'high',
            operation,
            algorithm,
            error: error.message,
            ...details
        });
    }

    // Device management events
    deviceProvisioned(deviceId, details = {}) {
        this.auditLog('device_provision', {
            deviceId,
            ...details
        });
    }

    deviceRevoked(deviceId, reason, details = {}) {
        this.securityEvent('device_revoked', {
            severity: 'medium',
            deviceId,
            reason,
            ...details
        });
    }

    // OTA update events
    otaUpdateStarted(deviceId, version, details = {}) {
        this.auditLog('ota_update_start', {
            deviceId,
            version,
            ...details
        });
    }

    otaUpdateCompleted(deviceId, version, details = {}) {
        this.auditLog('ota_update_complete', {
            deviceId,
            version,
            result: 'success',
            ...details
        });
    }

    otaUpdateFailed(deviceId, version, reason, details = {}) {
        this.securityEvent('ota_update_failed', {
            severity: 'medium',
            deviceId,
            version,
            reason,
            ...details
        });
    }

    // Performance logging
    performanceMetric(metric, value, unit = 'ms', details = {}) {
        this.info('Performance Metric', {
            performance: {
                metric,
                value,
                unit,
                timestamp: new Date().toISOString(),
                ...details
            }
        });
    }

    // API request logging
    apiRequest(method, path, statusCode, responseTime, details = {}) {
        const logLevel = statusCode >= 400 ? 'warn' : 'info';
        
        this.logger[logLevel]('API Request', {
            api: {
                method,
                path,
                statusCode,
                responseTime,
                timestamp: new Date().toISOString(),
                ...this.sanitizeMeta(details)
            }
        });
    }

    // Sanitize metadata to remove sensitive information
    sanitizeMeta(meta) {
        if (!meta || typeof meta !== 'object') {
            return meta;
        }

        const sensitiveFields = [
            'password',
            'privateKey',
            'secret',
            'token',
            'authorization',
            'cookie',
            'signature'
        ];

        const sanitized = { ...meta };

        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        // Recursively sanitize nested objects
        for (const [key, value] of Object.entries(sanitized)) {
            if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeMeta(value);
            }
        }

        return sanitized;
    }

    // Query logs
    queryLogs(filters = {}) {
        // This would integrate with a log management system
        // For now, return a placeholder
        return {
            query: filters,
            message: 'Log querying requires integration with log management system'
        };
    }

    // Get logger statistics
    getStats() {
        return {
            level: this.options.level,
            transports: this.transports.length,
            options: this.options
        };
    }
}

// Create singleton instance
const logger = new SecurityLogger();

module.exports = logger;