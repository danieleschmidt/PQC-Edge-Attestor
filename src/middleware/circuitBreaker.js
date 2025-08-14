/**
 * @file circuitBreaker.js
 * @brief Advanced circuit breaker middleware for Generation 2 reliability
 */

const { performance } = require('perf_hooks');
const winston = require('winston');

// Circuit breaker logger
const cbLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/circuit-breaker.log' }),
        new winston.transports.Console()
    ]
});

// Circuit breaker states
const STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.state = STATES.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = Date.now();
        this.lastFailureTime = null;
        
        // Configuration
        this.failureThreshold = options.failureThreshold || 5;
        this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
        this.successThreshold = options.successThreshold || 2;
        this.timeout = options.timeout || 10000; // 10 seconds
        this.monitoringPeriod = options.monitoringPeriod || 300000; // 5 minutes
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            averageResponseTime: 0,
            lastResetTime: Date.now()
        };
        
        // Start monitoring
        this.startMonitoring();
    }
    
    async execute(operation, fallback = null) {
        this.metrics.totalRequests++;
        
        if (this.state === STATES.OPEN) {
            if (Date.now() < this.nextAttempt) {
                this.metrics.rejectedRequests++;
                cbLogger.warn('Circuit breaker rejected request', {
                    circuitBreaker: this.name,
                    state: this.state,
                    failureCount: this.failureCount
                });
                
                if (fallback) {
                    return await fallback();
                }
                throw new Error(`Circuit breaker is OPEN for ${this.name}`);
            } else {
                this.state = STATES.HALF_OPEN;
                this.successCount = 0;
                cbLogger.info('Circuit breaker transitioning to HALF_OPEN', {
                    circuitBreaker: this.name
                });
            }
        }
        
        const startTime = performance.now();
        
        try {
            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Operation timeout')), this.timeout);
            });
            
            // Race between operation and timeout
            const result = await Promise.race([operation(), timeoutPromise]);
            
            const duration = performance.now() - startTime;
            this.onSuccess(duration);
            
            return result;
        } catch (error) {
            const duration = performance.now() - startTime;
            this.onFailure(error, duration);
            
            if (fallback) {
                cbLogger.info('Executing fallback', {
                    circuitBreaker: this.name,
                    error: error.message
                });
                return await fallback();
            }
            
            throw error;
        }
    }
    
    onSuccess(duration) {
        this.metrics.successfulRequests++;
        this.updateAverageResponseTime(duration);
        
        if (this.state === STATES.HALF_OPEN) {
            this.successCount++;
            
            if (this.successCount >= this.successThreshold) {
                this.reset();
                cbLogger.info('Circuit breaker reset to CLOSED', {
                    circuitBreaker: this.name,
                    successCount: this.successCount
                });
            }
        } else if (this.state === STATES.CLOSED) {
            this.failureCount = Math.max(0, this.failureCount - 1);
        }
    }
    
    onFailure(error, duration) {
        this.metrics.failedRequests++;
        this.updateAverageResponseTime(duration);
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        cbLogger.warn('Circuit breaker recorded failure', {
            circuitBreaker: this.name,
            error: error.message,
            failureCount: this.failureCount,
            threshold: this.failureThreshold
        });
        
        if (this.failureCount >= this.failureThreshold) {
            this.trip();
        }
    }
    
    trip() {
        this.state = STATES.OPEN;
        this.nextAttempt = Date.now() + this.recoveryTimeout;
        
        cbLogger.error('Circuit breaker tripped to OPEN state', {
            circuitBreaker: this.name,
            failureCount: this.failureCount,
            nextAttempt: new Date(this.nextAttempt).toISOString()
        });
    }
    
    reset() {
        this.state = STATES.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = 0;
    }
    
    updateAverageResponseTime(duration) {
        const totalResponses = this.metrics.successfulRequests + this.metrics.failedRequests;
        this.metrics.averageResponseTime = 
            ((this.metrics.averageResponseTime * (totalResponses - 1)) + duration) / totalResponses;
    }
    
    getMetrics() {
        const now = Date.now();
        const uptime = now - this.metrics.lastResetTime;
        
        return {
            circuitBreaker: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            nextAttempt: this.nextAttempt > now ? new Date(this.nextAttempt).toISOString() : null,
            lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
            metrics: {
                ...this.metrics,
                uptime: uptime,
                successRate: this.metrics.totalRequests > 0 
                    ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
                    : '0%',
                failureRate: this.metrics.totalRequests > 0 
                    ? (this.metrics.failedRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
                    : '0%'
            }
        };
    }
    
    startMonitoring() {
        setInterval(() => {
            const metrics = this.getMetrics();
            
            cbLogger.info('Circuit breaker health check', metrics);
            
            // Auto-reset metrics periodically
            if (Date.now() - this.metrics.lastResetTime > this.monitoringPeriod) {
                this.resetMetrics();
            }
        }, 60000); // Check every minute
    }
    
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            averageResponseTime: 0,
            lastResetTime: Date.now()
        };
    }
}

// Global circuit breaker registry
const circuitBreakers = new Map();

// Circuit breaker middleware factory
const createCircuitBreaker = (name, options = {}) => {
    if (!circuitBreakers.has(name)) {
        circuitBreakers.set(name, new CircuitBreaker(name, options));
    }
    
    return circuitBreakers.get(name);
};

// Express middleware for circuit breaker
const circuitBreakerMiddleware = (name, options = {}) => {
    const cb = createCircuitBreaker(name, options);
    
    return async (req, res, next) => {
        const operation = () => {
            return new Promise((resolve, reject) => {
                const originalSend = res.send;
                const originalJson = res.json;
                
                res.send = function(data) {
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    } else {
                        resolve(data);
                    }
                    return originalSend.call(this, data);
                };
                
                res.json = function(data) {
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    } else {
                        resolve(data);
                    }
                    return originalJson.call(this, data);
                };
                
                next();
            });
        };
        
        const fallback = options.fallback || (() => {
            return res.status(503).json({
                success: false,
                error: {
                    message: 'Service temporarily unavailable',
                    code: 'CIRCUIT_BREAKER_OPEN',
                    circuitBreaker: name
                },
                timestamp: new Date().toISOString()
            });
        });
        
        try {
            await cb.execute(operation, fallback);
        } catch (error) {
            cbLogger.error('Circuit breaker execution failed', {
                circuitBreaker: name,
                error: error.message,
                url: req.originalUrl
            });
            
            if (!res.headersSent) {
                res.status(503).json({
                    success: false,
                    error: {
                        message: 'Service temporarily unavailable',
                        code: 'CIRCUIT_BREAKER_ERROR',
                        circuitBreaker: name
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
    };
};

// Health check for all circuit breakers
const getCircuitBreakerHealth = () => {
    const health = {
        circuitBreakers: [],
        summary: {
            total: circuitBreakers.size,
            closed: 0,
            open: 0,
            halfOpen: 0
        }
    };
    
    for (const [name, cb] of circuitBreakers) {
        const metrics = cb.getMetrics();
        health.circuitBreakers.push(metrics);
        
        switch (metrics.state) {
            case STATES.CLOSED:
                health.summary.closed++;
                break;
            case STATES.OPEN:
                health.summary.open++;
                break;
            case STATES.HALF_OPEN:
                health.summary.halfOpen++;
                break;
        }
    }
    
    return health;
};

module.exports = {
    CircuitBreaker,
    createCircuitBreaker,
    circuitBreakerMiddleware,
    getCircuitBreakerHealth,
    STATES
};