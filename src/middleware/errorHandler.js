/**
 * @file errorHandler.js
 * @brief Comprehensive error handling middleware for Generation 2
 */

const winston = require('winston');

// Configure error logger
const errorLogger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => {
            return JSON.stringify({
                timestamp: info.timestamp,
                level: info.level,
                message: info.message,
                stack: info.stack,
                ...info
            });
        })
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Custom error classes
class PQCError extends Error {
    constructor(message, statusCode = 500, code = 'PQC_ERROR') {
        super(message);
        this.name = 'PQCError';
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends PQCError {
    constructor(message, details = []) {
        super(message, 400, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
        this.details = details;
    }
}

class AuthenticationError extends PQCError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
        this.name = 'AuthenticationError';
    }
}

class AuthorizationError extends PQCError {
    constructor(message = 'Insufficient permissions') {
        super(message, 403, 'AUTHORIZATION_ERROR');
        this.name = 'AuthorizationError';
    }
}

class NotFoundError extends PQCError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND_ERROR');
        this.name = 'NotFoundError';
    }
}

class RateLimitError extends PQCError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 429, 'RATE_LIMIT_ERROR');
        this.name = 'RateLimitError';
    }
}

class CryptographicError extends PQCError {
    constructor(message = 'Cryptographic operation failed') {
        super(message, 500, 'CRYPTOGRAPHIC_ERROR');
        this.name = 'CryptographicError';
    }
}

class AttestationError extends PQCError {
    constructor(message = 'Attestation verification failed') {
        super(message, 422, 'ATTESTATION_ERROR');
        this.name = 'AttestationError';
    }
}

// Error handling middleware
const errorHandler = (error, req, res, next) => {
    const requestId = req.id || 'unknown';
    const timestamp = new Date().toISOString();
    
    // Log error details
    errorLogger.error('Request error occurred', {
        requestId,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            body: req.method === 'POST' ? req.body : undefined
        },
        timestamp
    });

    // Handle operational errors (known errors)
    if (error.isOperational) {
        const response = {
            success: false,
            error: {
                message: error.message,
                code: error.code,
                timestamp
            },
            requestId
        };

        // Add additional details for validation errors
        if (error instanceof ValidationError && error.details.length > 0) {
            response.error.details = error.details;
        }

        return res.status(error.statusCode).json(response);
    }

    // Handle specific error types
    if (error.name === 'CastError') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Invalid ID format',
                code: 'INVALID_ID',
                timestamp
            },
            requestId
        });
    }

    if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => ({
            field: err.path,
            message: err.message
        }));

        return res.status(400).json({
            success: false,
            error: {
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: validationErrors,
                timestamp
            },
            requestId
        });
    }

    if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return res.status(409).json({
            success: false,
            error: {
                message: `Duplicate ${field} value`,
                code: 'DUPLICATE_RESOURCE',
                timestamp
            },
            requestId
        });
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Invalid JSON format',
                code: 'JSON_PARSE_ERROR',
                timestamp
            },
            requestId
        });
    }

    // Log unexpected errors
    errorLogger.error('Unexpected error occurred', {
        requestId,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip
        }
    });

    // Send generic error response for security
    res.status(500).json({
        success: false,
        error: {
            message: process.env.NODE_ENV === 'production' 
                ? 'Internal server error' 
                : error.message,
            code: 'INTERNAL_SERVER_ERROR',
            timestamp
        },
        requestId
    });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler
const notFoundHandler = (req, res, next) => {
    const error = new NotFoundError(`Route ${req.originalUrl} not found`);
    next(error);
};

module.exports = {
    errorHandler,
    asyncHandler,
    notFoundHandler,
    PQCError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    RateLimitError,
    CryptographicError,
    AttestationError
};