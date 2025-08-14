/**
 * @file circuitBreaker.js
 * @brief Advanced circuit breaker implementation for Generation 2 reliability
 */

const winston = require('winston');

// Circuit breaker logger
const logger = winston.createLogger({
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

class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold || 5;
        this.timeout = options.timeout || 30000; // 30 seconds
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
        
        // Circuit states: CLOSED, OPEN, HALF_OPEN
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            circuitOpenings: 0,
            averageResponseTime: 0,
            responseTimeHistory: []
        };
        
        // Health check
        this.healthCheck = options.healthCheck || (() => Promise.resolve(true));
        
        logger.info(`Circuit breaker '${this.name}' initialized`, {
            failureThreshold: this.failureThreshold,
            timeout: this.timeout,
            resetTimeout: this.resetTimeout
        });
    }

    async execute(operation, fallback = null) {
        this.metrics.totalRequests++;
        
        if (this.state === 'OPEN') {
            if (this.shouldAttemptReset()) {
                this.state = 'HALF_OPEN';
                logger.info(`Circuit breaker '${this.name}' transitioning to HALF_OPEN`);
            } else {
                logger.warn(`Circuit breaker '${this.name}' is OPEN, executing fallback`);
                if (fallback) return await fallback();
                throw new Error(`Circuit breaker '${this.name}' is OPEN`);
            }
        }

        const startTime = Date.now();
        
        try {
            // Execute with timeout
            const result = await Promise.race([
                operation(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
                )
            ]);

            // Operation succeeded
            const responseTime = Date.now() - startTime;
            this.onSuccess(responseTime);
            
            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.onFailure(error, responseTime);
            
            if (fallback) {
                logger.info(`Circuit breaker '${this.name}' executing fallback after failure`);
                return await fallback();
            }
            
            throw error;
        }
    }

    onSuccess(responseTime) {
        this.metrics.successfulRequests++;
        this.updateResponseTime(responseTime);
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= 3) {
                this.reset();
                logger.info(`Circuit breaker '${this.name}' reset to CLOSED after successful probe`);
            }
        } else {
            this.failureCount = 0;
        }
    }

    onFailure(error, responseTime) {
        this.metrics.failedRequests++;
        this.failureCount++;
        this.lastFailureTime = Date.now();
        this.updateResponseTime(responseTime);
        
        if (error.message === 'Operation timeout') {
            this.metrics.timeouts++;
        }

        logger.warn(`Circuit breaker '${this.name}' recorded failure`, {
            error: error.message,
            failureCount: this.failureCount,
            responseTime
        });

        if (this.failureCount >= this.failureThreshold) {
            this.trip();
        }
    }

    trip() {
        this.state = 'OPEN';
        this.metrics.circuitOpenings++;
        this.successCount = 0;
        
        logger.error(`Circuit breaker '${this.name}' TRIPPED to OPEN state`, {
            failureCount: this.failureCount,
            failureThreshold: this.failureThreshold
        });
    }

    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
    }

    shouldAttemptReset() {
        return this.lastFailureTime && 
               (Date.now() - this.lastFailureTime) >= this.resetTimeout;
    }

    updateResponseTime(responseTime) {
        const history = this.metrics.responseTimeHistory;
        history.push(responseTime);
        
        // Keep only last 100 response times
        if (history.length > 100) {
            history.shift();
        }
        
        // Calculate average
        this.metrics.averageResponseTime = 
            history.reduce((sum, time) => sum + time, 0) / history.length;
    }

    async runHealthCheck() {
        try {
            const isHealthy = await this.healthCheck();
            if (!isHealthy && this.state === 'CLOSED') {
                logger.warn(`Health check failed for circuit breaker '${this.name}'`);
                this.failureCount++;
                if (this.failureCount >= this.failureThreshold) {
                    this.trip();
                }
            } else if (isHealthy && this.state === 'OPEN' && this.shouldAttemptReset()) {
                this.state = 'HALF_OPEN';
                logger.info(`Circuit breaker '${this.name}' transitioning to HALF_OPEN after health check`);
            }
            return isHealthy;
        } catch (error) {
            logger.error(`Health check error for circuit breaker '${this.name}'`, { error: error.message });
            return false;
        }
    }

    getMetrics() {
        const totalRequests = this.metrics.totalRequests;
        const successRate = totalRequests > 0 ? 
            (this.metrics.successfulRequests / totalRequests) * 100 : 100;
        
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successRate: Math.round(successRate * 100) / 100,
            averageResponseTime: Math.round(this.metrics.averageResponseTime),
            ...this.metrics
        };
    }

    // Express middleware factory
    static middleware(name, operation, options = {}) {
        const breaker = new CircuitBreaker(name, options);
        
        return async (req, res, next) => {
            try {
                await breaker.execute(
                    () => operation(req, res),
                    options.fallback ? () => options.fallback(req, res) : null
                );
                next();
            } catch (error) {
                next(error);
            }
        };
    }
}

// Global circuit breaker registry
const circuitBreakers = new Map();

function getCircuitBreaker(name, options) {
    if (!circuitBreakers.has(name)) {
        circuitBreakers.set(name, new CircuitBreaker(name, options));
    }
    return circuitBreakers.get(name);
}

function getAllMetrics() {
    const metrics = {};
    for (const [name, breaker] of circuitBreakers) {
        metrics[name] = breaker.getMetrics();
    }
    return metrics;
}

// Periodic health checks
setInterval(async () => {
    for (const [name, breaker] of circuitBreakers) {
        await breaker.runHealthCheck();
    }
}, 30000); // Every 30 seconds

module.exports = {
    CircuitBreaker,
    getCircuitBreaker,
    getAllMetrics,
    middleware: CircuitBreaker.middleware
};