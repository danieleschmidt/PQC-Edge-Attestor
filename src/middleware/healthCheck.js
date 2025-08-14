/**
 * @file healthCheck.js
 * @brief Comprehensive health check system for Generation 2 reliability
 */

const winston = require('winston');
const { getCircuitBreaker } = require('./circuitBreaker');

// Health check logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/health.log' }),
        new winston.transports.Console()
    ]
});

class HealthCheckManager {
    constructor() {
        this.checks = new Map();
        this.lastResults = new Map();
        this.systemHealth = {
            status: 'unknown',
            lastCheck: null,
            uptime: process.uptime(),
            version: '1.0.0'
        };
        
        // Register default health checks
        this.registerDefaultChecks();
        
        // Run health checks periodically
        setInterval(() => this.runAllChecks(), 30000); // Every 30 seconds
    }

    registerCheck(name, check, options = {}) {
        const config = {
            name,
            check,
            timeout: options.timeout || 5000,
            interval: options.interval || 30000,
            critical: options.critical !== false,
            tags: options.tags || [],
            retryCount: options.retryCount || 2,
            retryDelay: options.retryDelay || 1000
        };
        
        this.checks.set(name, config);
        logger.info(`Health check '${name}' registered`, { critical: config.critical });
        
        return this;
    }

    registerDefaultChecks() {
        // Memory health check
        this.registerCheck('memory', async () => {
            const memUsage = process.memoryUsage();
            const totalMem = memUsage.heapTotal;
            const usedMem = memUsage.heapUsed;
            const freeMemPercentage = ((totalMem - usedMem) / totalMem) * 100;
            
            if (freeMemPercentage < 10) {
                throw new Error(`Low memory: ${freeMemPercentage.toFixed(2)}% free`);
            }
            
            return {
                status: 'healthy',
                details: {
                    heapUsed: Math.round(usedMem / 1024 / 1024),
                    heapTotal: Math.round(totalMem / 1024 / 1024),
                    freePercentage: Math.round(freeMemPercentage)
                }
            };
        }, { critical: true, tags: ['system', 'memory'] });

        // Process health check
        this.registerCheck('process', async () => {
            const uptime = process.uptime();
            const cpuUsage = process.cpuUsage();
            
            return {
                status: 'healthy',
                details: {
                    pid: process.pid,
                    uptime: Math.round(uptime),
                    nodeVersion: process.version,
                    platform: process.platform,
                    cpuUser: cpuUsage.user,
                    cpuSystem: cpuUsage.system
                }
            };
        }, { critical: true, tags: ['system', 'process'] });

        // API health check
        this.registerCheck('api', async () => {
            // Basic API functionality test
            const startTime = Date.now();
            
            // Simulate API check (could be actual endpoint test)
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const responseTime = Date.now() - startTime;
            
            if (responseTime > 1000) {
                throw new Error(`API response time too high: ${responseTime}ms`);
            }
            
            return {
                status: 'healthy',
                details: {
                    responseTime,
                    timestamp: new Date().toISOString()
                }
            };
        }, { critical: true, tags: ['api', 'performance'] });

        // Circuit breakers health check
        this.registerCheck('circuit-breakers', async () => {
            const { getAllMetrics } = require('./circuitBreaker');
            const metrics = getAllMetrics();
            
            const unhealthyBreakers = Object.entries(metrics)
                .filter(([_, metric]) => metric.state === 'OPEN')
                .map(([name]) => name);
            
            if (unhealthyBreakers.length > 0) {
                throw new Error(`Circuit breakers OPEN: ${unhealthyBreakers.join(', ')}`);
            }
            
            return {
                status: 'healthy',
                details: {
                    totalBreakers: Object.keys(metrics).length,
                    openBreakers: unhealthyBreakers.length,
                    metrics
                }
            };
        }, { critical: false, tags: ['circuit-breaker', 'resilience'] });
    }

    async runCheck(name, config) {
        const startTime = Date.now();
        let attempt = 0;
        let lastError;

        while (attempt <= config.retryCount) {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Health check timeout')), config.timeout)
                );

                const result = await Promise.race([
                    config.check(),
                    timeoutPromise
                ]);

                const duration = Date.now() - startTime;
                
                const healthResult = {
                    name,
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    duration,
                    attempt,
                    critical: config.critical,
                    tags: config.tags,
                    details: result.details || result
                };

                this.lastResults.set(name, healthResult);
                return healthResult;

            } catch (error) {
                lastError = error;
                attempt++;
                
                if (attempt <= config.retryCount) {
                    logger.warn(`Health check '${name}' failed, retrying (${attempt}/${config.retryCount})`, {
                        error: error.message
                    });
                    
                    if (config.retryDelay > 0) {
                        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
                    }
                }
            }
        }

        // All retries failed
        const duration = Date.now() - startTime;
        const healthResult = {
            name,
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            duration,
            attempt: attempt - 1,
            critical: config.critical,
            tags: config.tags,
            error: lastError.message,
            stack: lastError.stack
        };

        this.lastResults.set(name, healthResult);
        
        logger.error(`Health check '${name}' failed after ${config.retryCount} retries`, {
            error: lastError.message,
            duration
        });

        return healthResult;
    }

    async runAllChecks() {
        const startTime = Date.now();
        const results = [];
        
        logger.info('Running all health checks');

        // Run all checks concurrently
        const checkPromises = Array.from(this.checks.entries()).map(async ([name, config]) => {
            return await this.runCheck(name, config);
        });

        const checkResults = await Promise.allSettled(checkPromises);
        
        checkResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                const checkName = Array.from(this.checks.keys())[index];
                results.push({
                    name: checkName,
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    error: 'Health check runner failed',
                    details: result.reason?.message || 'Unknown error'
                });
            }
        });

        // Determine overall system health
        const criticalFailures = results.filter(r => r.status === 'unhealthy' && r.critical);
        const totalFailures = results.filter(r => r.status === 'unhealthy');
        
        let overallStatus;
        if (criticalFailures.length > 0) {
            overallStatus = 'unhealthy';
        } else if (totalFailures.length > 0) {
            overallStatus = 'degraded';
        } else {
            overallStatus = 'healthy';
        }

        this.systemHealth = {
            status: overallStatus,
            lastCheck: new Date().toISOString(),
            duration: Date.now() - startTime,
            uptime: process.uptime(),
            version: '1.0.0',
            checks: results.length,
            healthyChecks: results.filter(r => r.status === 'healthy').length,
            unhealthyChecks: totalFailures.length,
            criticalFailures: criticalFailures.length
        };

        logger.info('Health check cycle completed', this.systemHealth);
        
        return {
            overall: this.systemHealth,
            checks: results
        };
    }

    getHealth(detailed = false) {
        const health = {
            ...this.systemHealth,
            timestamp: new Date().toISOString()
        };

        if (detailed) {
            health.checks = Array.from(this.lastResults.values());
        }

        return health;
    }

    // Express middleware for health check endpoint
    healthEndpoint() {
        return async (req, res) => {
            const detailed = req.query.detailed === 'true';
            const health = this.getHealth(detailed);
            
            // Set appropriate HTTP status
            let statusCode = 200;
            if (health.status === 'degraded') {
                statusCode = 200; // Still serving requests
            } else if (health.status === 'unhealthy') {
                statusCode = 503; // Service unavailable
            }

            res.status(statusCode).json({
                success: health.status === 'healthy',
                data: health,
                timestamp: new Date().toISOString(),
                requestId: req.id
            });
        };
    }

    // Readiness check (for Kubernetes)
    readinessEndpoint() {
        return async (req, res) => {
            const health = this.getHealth(false);
            
            // Ready if no critical failures
            const isReady = health.criticalFailures === 0;
            
            res.status(isReady ? 200 : 503).json({
                ready: isReady,
                status: health.status,
                timestamp: new Date().toISOString(),
                requestId: req.id
            });
        };
    }

    // Liveness check (for Kubernetes)
    livenessEndpoint() {
        return (req, res) => {
            // Simple liveness check - if we can respond, we're alive
            res.status(200).json({
                alive: true,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                requestId: req.id
            });
        };
    }
}

// Singleton instance
const healthCheckManager = new HealthCheckManager();

module.exports = {
    HealthCheckManager,
    healthCheckManager,
    // Export middleware functions
    healthEndpoint: () => healthCheckManager.healthEndpoint(),
    readinessEndpoint: () => healthCheckManager.readinessEndpoint(),
    livenessEndpoint: () => healthCheckManager.livenessEndpoint()
};