/**
 * @file healthCheck.js
 * @brief Advanced health checking middleware for Generation 2 reliability
 */

const { performance } = require('perf_hooks');
const winston = require('winston');

// Health check logger
const healthLogger = winston.createLogger({
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
        this.status = {
            overall: 'healthy',
            lastChecked: Date.now(),
            checks: {}
        };
        this.metrics = {
            totalChecks: 0,
            healthyChecks: 0,
            unhealthyChecks: 0,
            averageResponseTime: 0
        };
    }

    registerCheck(name, checkFunction, options = {}) {
        this.checks.set(name, {
            function: checkFunction,
            critical: options.critical !== false,
            timeout: options.timeout || 5000,
            interval: options.interval || 30000,
            tags: options.tags || [],
            lastRun: null,
            lastResult: null,
            failureCount: 0,
            enabled: true
        });

        healthLogger.info(`Health check '${name}' registered`, {
            critical: options.critical !== false,
            timeout: options.timeout || 5000,
            tags: options.tags || []
        });
    }

    async runCheck(name) {
        const check = this.checks.get(name);
        if (!check || !check.enabled) {
            return { status: 'disabled', name };
        }

        const startTime = performance.now();
        
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
            });

            const result = await Promise.race([
                check.function(),
                timeoutPromise
            ]);

            const duration = performance.now() - startTime;
            check.lastRun = Date.now();
            check.lastResult = {
                status: 'healthy',
                duration,
                result,
                timestamp: Date.now()
            };
            check.failureCount = 0;

            this.metrics.healthyChecks++;
            return check.lastResult;

        } catch (error) {
            const duration = performance.now() - startTime;
            check.lastRun = Date.now();
            check.failureCount++;
            check.lastResult = {
                status: 'unhealthy',
                duration,
                error: error.message,
                timestamp: Date.now(),
                failureCount: check.failureCount
            };

            this.metrics.unhealthyChecks++;
            healthLogger.warn(`Health check '${name}' failed`, {
                error: error.message,
                duration,
                failureCount: check.failureCount
            });

            return check.lastResult;
        } finally {
            this.metrics.totalChecks++;
        }
    }

    async runAllChecks() {
        const results = {};
        let overallHealthy = true;

        for (const [name, check] of this.checks) {
            if (!check.enabled) continue;

            const result = await this.runCheck(name);
            results[name] = result;

            if (result.status === 'unhealthy' && check.critical) {
                overallHealthy = false;
            }
        }

        this.status = {
            overall: overallHealthy ? 'healthy' : 'unhealthy',
            lastChecked: Date.now(),
            checks: results
        };

        return this.status;
    }

    getHealth() {
        return {
            ...this.status,
            metrics: this.metrics,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: require('../../package.json').version
        };
    }

    disableCheck(name) {
        const check = this.checks.get(name);
        if (check) {
            check.enabled = false;
            healthLogger.info(`Health check '${name}' disabled`);
        }
    }

    enableCheck(name) {
        const check = this.checks.get(name);
        if (check) {
            check.enabled = true;
            healthLogger.info(`Health check '${name}' enabled`);
        }
    }
}

// Global health check manager instance
const healthCheckManager = new HealthCheckManager();

// Register default health checks
healthCheckManager.registerCheck('memory', async () => {
    const usage = process.memoryUsage();
    const memoryUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;
    
    if (memoryUsagePercent > 90) {
        throw new Error(`High memory usage: ${memoryUsagePercent.toFixed(2)}%`);
    }
    
    return { memoryUsagePercent: memoryUsagePercent.toFixed(2) };
}, { critical: true, tags: ['system'] });

healthCheckManager.registerCheck('uptime', async () => {
    const uptime = process.uptime();
    return { uptime, status: uptime > 0 ? 'running' : 'starting' };
}, { critical: false, tags: ['system'] });

// Health endpoint middleware
const healthEndpoint = () => (req, res) => {
    res.json({
        success: true,
        data: healthCheckManager.getHealth(),
        timestamp: new Date().toISOString(),
        requestId: req.id
    });
};

// Readiness endpoint (for K8s)
const readinessEndpoint = () => async (req, res) => {
    try {
        const health = await healthCheckManager.runAllChecks();
        const status = health.overall === 'healthy' ? 200 : 503;
        
        res.status(status).json({
            ready: health.overall === 'healthy',
            status: health.overall,
            checks: health.checks,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            ready: false,
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// Liveness endpoint (for K8s)
const livenessEndpoint = () => (req, res) => {
    res.json({
        alive: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
};

// Health check middleware
const healthCheckMiddleware = (options = {}) => {
    return async (req, res, next) => {
        const checkInterval = options.interval || 60000; // 1 minute
        const lastCheck = healthCheckManager.status.lastChecked;
        
        if (Date.now() - lastCheck > checkInterval) {
            // Run health checks in background
            setImmediate(async () => {
                try {
                    await healthCheckManager.runAllChecks();
                } catch (error) {
                    healthLogger.error('Background health check failed', { error: error.message });
                }
            });
        }
        
        next();
    };
};

module.exports = {
    healthCheckManager,
    healthEndpoint,
    readinessEndpoint,
    livenessEndpoint,
    healthCheckMiddleware
};