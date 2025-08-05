/**
 * @file security.js
 * @brief Enhanced security middleware for Generation 2
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const winston = require('winston');
const { AuthenticationError, AuthorizationError, RateLimitError } = require('./errorHandler');

// Security logger
const securityLogger = winston.createLogger({
    level: 'warn',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/security.log' }),
        new winston.transports.Console()
    ]
});

// Rate limiters
const strictRateLimiter = new RateLimiterMemory({
    points: 5, // 5 requests
    duration: 60, // per minute
});

const moderateRateLimiter = new RateLimiterMemory({
    points: 50, // 50 requests
    duration: 60, // per minute
});

const bruteForceProtection = new RateLimiterMemory({
    points: 3, // 3 failed attempts
    duration: 900, // per 15 minutes
    blockDuration: 900 // block for 15 minutes
});

// Request ID generator
const generateRequestId = (req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-ID', req.id);
    next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Custom security headers
    res.setHeader('X-PQC-Version', '1.0.0');
    res.setHeader('X-Quantum-Resistant', 'true');
    
    // Remove server information
    res.removeHeader('X-Powered-By');
    
    next();
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
    const sanitizeObject = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Remove potentially dangerous characters
                sanitized[key] = value
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+=/gi, '')
                    .trim();
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    };

    if (req.body) {
        req.body = sanitizeObject(req.body);
    }
    
    if (req.query) {
        req.query = sanitizeObject(req.query);
    }
    
    next();
};

// API key authentication
const authenticateAPIKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        securityLogger.warn('Missing API key', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl
        });
        return next(new AuthenticationError('API key required'));
    }
    
    // In production, validate against database
    const validApiKeys = [
        'pqc_test_key_terragon_2024',
        'pqc_device_key_terragon_2024',
        'pqc_admin_key_terragon_2024'
    ];
    
    if (!validApiKeys.includes(apiKey)) {
        securityLogger.warn('Invalid API key', {
            apiKey: apiKey.substring(0, 10) + '...',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl
        });
        return next(new AuthenticationError('Invalid API key'));
    }
    
    // Set user context based on API key
    req.user = {
        id: 'api-user',
        type: 'api',
        permissions: ['read', 'write']
    };
    
    next();
};

// JWT authentication middleware
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return next(new AuthenticationError('Access token required'));
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded;
        next();
    } catch (error) {
        securityLogger.warn('Invalid JWT token', {
            error: error.message,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        return next(new AuthenticationError('Invalid access token'));
    }
};

// Role-based authorization
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AuthenticationError('Authentication required'));
        }
        
        const userRole = req.user.role || 'user';
        
        if (!roles.includes(userRole)) {
            securityLogger.warn('Insufficient permissions', {
                userId: req.user.id,
                userRole: userRole,
                requiredRoles: roles,
                url: req.originalUrl,
                ip: req.ip
            });
            return next(new AuthorizationError(`Requires one of: ${roles.join(', ')}`));
        }
        
        next();
    };
};

// Rate limiting middleware
const createRateLimiter = (type = 'moderate') => {
    const limiter = type === 'strict' ? strictRateLimiter : moderateRateLimiter;
    
    return async (req, res, next) => {
        try {
            const key = req.ip + ':' + req.originalUrl;
            await limiter.consume(key);
            next();
        } catch (rejRes) {
            securityLogger.warn('Rate limit exceeded', {
                ip: req.ip,
                url: req.originalUrl,
                userAgent: req.get('User-Agent')
            });
            
            res.setHeader('Retry-After', Math.round(rejRes.msBeforeNext / 1000));
            next(new RateLimitError('Too many requests, please slow down'));
        }
    };
};

// Brute force protection
const protectBruteForce = async (req, res, next) => {
    try {
        const key = req.ip;
        await bruteForceProtection.consume(key);
        next();
    } catch (rejRes) {
        securityLogger.error('Potential brute force attack detected', {
            ip: req.ip,
            url: req.originalUrl,
            userAgent: req.get('User-Agent'),
            blockedUntil: new Date(Date.now() + rejRes.msBeforeNext)
        });
        
        next(new RateLimitError('Too many failed attempts. Please try again later.'));
    }
};

// Audit logging middleware
const auditLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/audit.log' })
    ]
});

const auditLog = (req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        auditLogger.info('API Request', {
            requestId: req.id,
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration: duration,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id,
            timestamp: new Date().toISOString()
        });
    });
    
    next();
};

// Device authentication (for IoT devices)
const authenticateDevice = (req, res, next) => {
    const deviceId = req.headers['x-device-id'];
    const deviceSignature = req.headers['x-device-signature'];
    
    if (!deviceId || !deviceSignature) {
        return next(new AuthenticationError('Device authentication required'));
    }
    
    // Mock device authentication for Generation 2
    req.device = {
        id: deviceId,
        type: 'iot_device',
        status: 'active',
        lastSeen: new Date()
    };
    
    next();
};

// Content validation middleware
const validateContentType = (expectedTypes = ['application/json']) => {
    return (req, res, next) => {
        if (req.method === 'GET' || req.method === 'DELETE') {
            return next();
        }
        
        const contentType = req.get('Content-Type');
        
        if (!contentType || !expectedTypes.some(type => contentType.includes(type))) {
            return next(new ValidationError(`Content-Type must be one of: ${expectedTypes.join(', ')}`));
        }
        
        next();
    };
};

module.exports = {
    generateRequestId,
    securityHeaders,
    sanitizeInput,
    authenticateAPIKey,
    authenticateJWT,
    authenticateDevice,
    requireRole,
    createRateLimiter,
    protectBruteForce,
    auditLog,
    validateContentType,
    securityLogger
};