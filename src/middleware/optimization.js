/**
 * @file optimization.js
 * @brief Performance optimization middleware for Generation 3
 */

const compression = require('compression');
const CacheService = require('../services/cacheService');
const PerformanceService = require('../services/performanceService');
const winston = require('winston');

// Optimization logger
const optimizationLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/optimization.log' }),
        new winston.transports.Console()
    ]
});

// Initialize services
const cacheService = new CacheService({
    defaultTTL: 3600, // 1 hour
    maxMemoryMB: 100,
    cleanupInterval: 300000 // 5 minutes
});

const performanceService = new PerformanceService({
    autoScaling: true,
    cpuThreshold: 80,
    memoryThreshold: 80,
    responseTimeThreshold: 1000
});

/**
 * Smart compression middleware with adaptive thresholds
 */
const smartCompression = compression({
    threshold: (req, res) => {
        // Adaptive compression based on content type and size
        const contentType = res.getHeader('content-type') || '';
        
        if (contentType.includes('application/json')) {
            return 512; // Compress JSON responses > 512 bytes
        }
        
        if (contentType.includes('text/')) {
            return 1024; // Compress text responses > 1KB
        }
        
        return 2048; // Default threshold
    },
    level: (req, res) => {
        // Adaptive compression level based on CPU usage
        const metrics = performanceService.getMetrics();
        
        if (metrics.system.cpuUsage > 80) {
            return 1; // Fast compression when CPU is high
        } else if (metrics.system.cpuUsage < 30) {
            return 9; // Best compression when CPU is low
        }
        
        return 6; // Balanced compression
    }
});

/**
 * Response caching middleware
 */
const responseCache = (options = {}) => {
    const defaultOptions = {
        ttl: 300, // 5 minutes
        skipCacheControl: false,
        cacheableStatusCodes: [200, 301, 302, 404],
        ...options
    };
    
    return async (req, res, next) => {
        // Skip caching for non-GET requests
        if (req.method !== 'GET') {
            return next();
        }
        
        // Skip caching if Cache-Control: no-cache header is present
        if (!defaultOptions.skipCacheControl && req.get('Cache-Control') === 'no-cache') {
            return next();
        }
        
        const cacheKey = `response:${req.method}:${req.originalUrl}:${req.get('user-agent') || 'unknown'}`;
        
        try {
            // Try to get cached response
            const cached = await cacheService.get(cacheKey);
            
            if (cached) {
                res.set(cached.headers);
                res.status(cached.statusCode);
                res.send(cached.body);
                
                optimizationLogger.debug('Response served from cache', {
                    url: req.originalUrl,
                    method: req.method,
                    statusCode: cached.statusCode
                });
                
                return;
            }
            
            // Intercept response
            const originalSend = res.send;
            const originalJson = res.json;
            
            res.send = function(body) {
                cacheResponse(req, res, body, cacheKey, defaultOptions);
                return originalSend.call(this, body);
            };
            
            res.json = function(obj) {
                cacheResponse(req, res, JSON.stringify(obj), cacheKey, defaultOptions);
                return originalJson.call(this, obj);
            };
            
            next();
            
        } catch (error) {
            optimizationLogger.error('Response cache error', {
                error: error.message,
                url: req.originalUrl
            });
            next();
        }
    };
};

/**
 * Cache response helper
 */
async function cacheResponse(req, res, body, cacheKey, options) {
    // Only cache successful responses
    if (options.cacheableStatusCodes.includes(res.statusCode)) {
        const responseData = {
            statusCode: res.statusCode,
            headers: res.getHeaders(),
            body: body,
            timestamp: Date.now()
        };
        
        await cacheService.set(cacheKey, responseData, options.ttl);
        
        optimizationLogger.debug('Response cached', {
            url: req.originalUrl,
            statusCode: res.statusCode,
            size: Buffer.byteLength(body, 'utf8')
        });
    }
}

/**
 * Request optimization middleware
 */
const requestOptimization = (req, res, next) => {
    const startTime = Date.now();
    
    // Add request ID for tracking
    if (!req.id) {
        req.id = require('crypto').randomUUID();
    }
    
    // Track response time
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode < 400;
        
        // Record metrics
        performanceService.recordRequest(responseTime, success);
        
        // Log slow requests
        if (responseTime > 1000) {
            optimizationLogger.warn('Slow request detected', {
                requestId: req.id,
                method: req.method,
                url: req.originalUrl,
                responseTime,
                statusCode: res.statusCode,
                userAgent: req.get('User-Agent')
            });
        }
    });
    
    next();
};

/**
 * Connection pooling middleware for database/external services
 */
const connectionPooling = async (req, res, next) => {
    // Add connection getter to request
    req.getConnection = async (type = 'default') => {
        return await performanceService.getConnection(type);
    };
    
    req.releaseConnection = async (connection, type = 'default') => {
        return await performanceService.releaseConnection(connection, type);
    };
    
    next();
};

/**
 * Content optimization middleware
 */
const contentOptimization = (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(obj) {
        // Remove null/undefined values to reduce payload size
        const optimized = removeNullValues(obj);
        
        // Add optimization headers
        res.set('X-Content-Optimized', 'true');
        res.set('X-Original-Size', JSON.stringify(obj).length);
        res.set('X-Optimized-Size', JSON.stringify(optimized).length);
        
        return originalJson.call(this, optimized);
    };
    
    next();
};

/**
 * Remove null/undefined values from object
 */
function removeNullValues(obj) {
    if (Array.isArray(obj)) {
        return obj.map(removeNullValues).filter(v => v !== null && v !== undefined);
    } else if (obj !== null && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const cleanValue = removeNullValues(value);
            if (cleanValue !== null && cleanValue !== undefined) {
                result[key] = cleanValue;
            }
        }
        return result;
    }
    return obj;
}

/**
 * Adaptive rate limiting based on system performance
 */
const adaptiveRateLimit = () => {
    return (req, res, next) => {
        const metrics = performanceService.getMetrics();
        
        // Adjust rate limits based on system performance
        let maxRequests = 100; // Default
        
        if (metrics.system.cpuUsage > 80) {
            maxRequests = 50; // Reduce load when CPU is high
        } else if (metrics.system.cpuUsage < 30) {
            maxRequests = 200; // Allow more requests when CPU is low
        }
        
        // Simple rate limiting logic (in production, use Redis)
        const clientKey = req.ip + ':' + req.originalUrl;
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        
        // This would be implemented with Redis in production
        req.rateLimit = {
            limit: maxRequests,
            remaining: maxRequests - 1,
            reset: now + windowMs
        };
        
        res.set('X-RateLimit-Limit', maxRequests);
        res.set('X-RateLimit-Remaining', req.rateLimit.remaining);
        res.set('X-RateLimit-Reset', req.rateLimit.reset);
        
        next();
    };
};

/**
 * Performance monitoring middleware
 */
const performanceMonitoring = (req, res, next) => {
    // Add performance data to response headers
    res.on('finish', () => {
        const metrics = performanceService.getMetrics();
        
        res.set('X-Response-Time', Date.now() - req.startTime);
        res.set('X-Server-CPU', metrics.system.cpuUsage);
        res.set('X-Server-Memory', metrics.system.memoryUsage);
        res.set('X-Active-Connections', metrics.system.activeConnections);
    });
    
    req.startTime = Date.now();
    next();
};

/**
 * Get optimization metrics
 */
const getOptimizationMetrics = () => {
    return {
        cache: cacheService.getStats(),
        performance: performanceService.getMetrics(),
        recommendations: performanceService.getRecommendations(),
        timestamp: new Date().toISOString()
    };
};

/**
 * Manual optimization trigger
 */
const triggerOptimization = async () => {
    const results = await performanceService.optimize();
    
    optimizationLogger.info('Manual optimization triggered', results);
    
    return results;
};

module.exports = {
    smartCompression,
    responseCache,
    requestOptimization,
    connectionPooling,
    contentOptimization,
    adaptiveRateLimit,
    performanceMonitoring,
    getOptimizationMetrics,
    triggerOptimization,
    cacheService,
    performanceService
};