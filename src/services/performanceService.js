/**
 * @file performanceService.js
 * @brief Performance optimization and auto-scaling service for Generation 3
 */

const { EventEmitter } = require('events');
const os = require('os');
const cluster = require('cluster');
const winston = require('winston');

// Performance logger
const perfLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/performance.log' }),
        new winston.transports.Console()
    ]
});

class PerformanceService extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxWorkers: config.maxWorkers || os.cpus().length,
            cpuThreshold: config.cpuThreshold || 80,
            memoryThreshold: config.memoryThreshold || 80,
            responseTimeThreshold: config.responseTimeThreshold || 1000,
            autoScaling: config.autoScaling || true,
            metricsInterval: config.metricsInterval || 10000,
            adaptivePooling: config.adaptivePooling || true,
            ...config
        };
        
        this.metrics = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                avgResponseTime: 0,
                p95ResponseTime: 0,
                currentRPS: 0
            },
            system: {
                cpuUsage: 0,
                memoryUsage: 0,
                loadAverage: [0, 0, 0],
                activeConnections: 0
            },
            workers: {
                active: cluster.isMaster ? Object.keys(cluster.workers).length : 1,
                target: this.config.maxWorkers,
                restarted: 0
            }
        };
        
        this.responseTimeBuffer = [];
        this.connectionPool = new Map();
        this.adaptiveSettings = {
            poolSize: 10,
            timeout: 5000,
            retryAttempts: 3
        };
        
        this._startMetricsCollection();
        this._initializeAdaptiveOptimizations();
    }

    /**
     * Initialize adaptive optimizations
     */
    _initializeAdaptiveOptimizations() {
        // Connection pooling optimization
        this.on('metrics', (metrics) => {
            this._adaptConnectionPool(metrics);
            this._adaptWorkerCount(metrics);
            this._adaptCacheStrategy(metrics);
        });
        
        // Auto-scaling based on load
        this.on('highLoad', (data) => {
            if (this.config.autoScaling && cluster.isMaster) {
                this._scaleUp(data);
            }
        });
        
        this.on('lowLoad', (data) => {
            if (this.config.autoScaling && cluster.isMaster) {
                this._scaleDown(data);
            }
        });
    }

    /**
     * Record request metrics
     */
    recordRequest(responseTime, success = true) {
        this.metrics.requests.total++;
        
        if (success) {
            this.metrics.requests.successful++;
        } else {
            this.metrics.requests.failed++;
        }
        
        // Update response time metrics
        this.responseTimeBuffer.push(responseTime);
        
        // Keep only last 1000 entries for sliding window
        if (this.responseTimeBuffer.length > 1000) {
            this.responseTimeBuffer.shift();
        }
        
        this._updateResponseTimeMetrics();
        
        // Emit performance events
        if (responseTime > this.config.responseTimeThreshold) {
            this.emit('slowRequest', { responseTime, threshold: this.config.responseTimeThreshold });
        }
    }

    /**
     * Update response time metrics
     */
    _updateResponseTimeMetrics() {
        if (this.responseTimeBuffer.length === 0) return;
        
        const sorted = this.responseTimeBuffer.slice().sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        
        this.metrics.requests.avgResponseTime = Math.round(sum / sorted.length);
        this.metrics.requests.p95ResponseTime = sorted[Math.floor(sorted.length * 0.95)] || 0;
    }

    /**
     * Get connection from pool
     */
    async getConnection(type = 'default') {
        const poolKey = `pool_${type}`;
        let pool = this.connectionPool.get(poolKey);
        
        if (!pool) {
            pool = {
                connections: [],
                activeCount: 0,
                maxSize: this.adaptiveSettings.poolSize,
                created: Date.now()
            };
            this.connectionPool.set(poolKey, pool);
        }
        
        // Simple connection simulation
        const connection = {
            id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            created: Date.now(),
            lastUsed: Date.now(),
            type: type
        };
        
        pool.activeCount++;
        
        perfLogger.debug('Connection acquired', {
            poolKey,
            connectionId: connection.id,
            activeCount: pool.activeCount
        });
        
        return connection;
    }

    /**
     * Release connection back to pool
     */
    async releaseConnection(connection, type = 'default') {
        const poolKey = `pool_${type}`;
        const pool = this.connectionPool.get(poolKey);
        
        if (pool && pool.activeCount > 0) {
            pool.activeCount--;
            
            perfLogger.debug('Connection released', {
                poolKey,
                connectionId: connection.id,
                activeCount: pool.activeCount
            });
        }
    }

    /**
     * Adapt connection pool based on metrics
     */
    _adaptConnectionPool(metrics) {
        if (!this.config.adaptivePooling) return;
        
        const currentRPS = metrics.requests.currentRPS;
        const avgResponseTime = metrics.requests.avgResponseTime;
        
        // Increase pool size if high RPS and slow responses
        if (currentRPS > 50 && avgResponseTime > 500) {
            this.adaptiveSettings.poolSize = Math.min(
                this.adaptiveSettings.poolSize + 2,
                50
            );
        }
        // Decrease pool size if low RPS
        else if (currentRPS < 10 && this.adaptiveSettings.poolSize > 5) {
            this.adaptiveSettings.poolSize = Math.max(
                this.adaptiveSettings.poolSize - 1,
                5
            );
        }
        
        perfLogger.debug('Adaptive pool sizing', {
            currentRPS,
            avgResponseTime,
            newPoolSize: this.adaptiveSettings.poolSize
        });
    }

    /**
     * Adapt worker count based on system metrics
     */
    _adaptWorkerCount(metrics) {
        if (!cluster.isMaster) return;
        
        const { cpuUsage, memoryUsage } = metrics.system;
        const currentWorkers = Object.keys(cluster.workers).length;
        
        // Scale up if high resource usage
        if (cpuUsage > this.config.cpuThreshold && currentWorkers < this.config.maxWorkers) {
            this.emit('highLoad', { cpuUsage, memoryUsage, currentWorkers });
        }
        // Scale down if low resource usage
        else if (cpuUsage < 30 && currentWorkers > 1) {
            this.emit('lowLoad', { cpuUsage, memoryUsage, currentWorkers });
        }
    }

    /**
     * Adapt cache strategy based on hit rates
     */
    _adaptCacheStrategy(metrics) {
        // This would integrate with CacheService
        // For now, emit event for external cache service
        this.emit('adaptCache', {
            responseTime: metrics.requests.avgResponseTime,
            rps: metrics.requests.currentRPS
        });
    }

    /**
     * Scale up worker processes
     */
    _scaleUp(data) {
        const targetWorkers = Math.min(
            Object.keys(cluster.workers).length + 1,
            this.config.maxWorkers
        );
        
        if (targetWorkers > Object.keys(cluster.workers).length) {
            cluster.fork();
            this.metrics.workers.active = targetWorkers;
            
            perfLogger.info('Scaled up workers', {
                previousCount: Object.keys(cluster.workers).length - 1,
                newCount: targetWorkers,
                reason: data
            });
            
            this.emit('scaleUp', { newWorkerCount: targetWorkers, reason: data });
        }
    }

    /**
     * Scale down worker processes
     */
    _scaleDown(data) {
        const workers = Object.keys(cluster.workers);
        
        if (workers.length > 1) {
            const workerToKill = cluster.workers[workers[0]];
            workerToKill.kill();
            
            this.metrics.workers.active = workers.length - 1;
            
            perfLogger.info('Scaled down workers', {
                previousCount: workers.length,
                newCount: workers.length - 1,
                reason: data
            });
            
            this.emit('scaleDown', { newWorkerCount: workers.length - 1, reason: data });
        }
    }

    /**
     * Start metrics collection
     */
    _startMetricsCollection() {
        setInterval(() => {
            this._collectSystemMetrics();
            this._calculateRPS();
            this.emit('metrics', this.getMetrics());
        }, this.config.metricsInterval);
    }

    /**
     * Collect system metrics
     */
    _collectSystemMetrics() {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Calculate CPU percentage (simplified)
        this.metrics.system.cpuUsage = Math.min(
            ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime()) * 100,
            100
        );
        
        this.metrics.system.memoryUsage = Math.round(
            (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
        );
        
        this.metrics.system.loadAverage = os.loadavg();
        
        // Check thresholds
        if (this.metrics.system.cpuUsage > this.config.cpuThreshold) {
            this.emit('highCPU', { usage: this.metrics.system.cpuUsage });
        }
        
        if (this.metrics.system.memoryUsage > this.config.memoryThreshold) {
            this.emit('highMemory', { usage: this.metrics.system.memoryUsage });
        }
    }

    /**
     * Calculate requests per second
     */
    _calculateRPS() {
        if (!this.lastRequestCount) {
            this.lastRequestCount = this.metrics.requests.total;
            this.lastRPSCheck = Date.now();
            return;
        }
        
        const now = Date.now();
        const timeDiff = (now - this.lastRPSCheck) / 1000;
        const requestDiff = this.metrics.requests.total - this.lastRequestCount;
        
        this.metrics.requests.currentRPS = Math.round(requestDiff / timeDiff);
        
        this.lastRequestCount = this.metrics.requests.total;
        this.lastRPSCheck = now;
    }

    /**
     * Get comprehensive metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString(),
            adaptiveSettings: this.adaptiveSettings,
            thresholds: {
                cpu: this.config.cpuThreshold,
                memory: this.config.memoryThreshold,
                responseTime: this.config.responseTimeThreshold
            }
        };
    }

    /**
     * Get performance recommendations
     */
    getRecommendations() {
        const metrics = this.getMetrics();
        const recommendations = [];
        
        // CPU recommendations
        if (metrics.system.cpuUsage > 90) {
            recommendations.push({
                type: 'critical',
                component: 'cpu',
                message: 'CPU usage critically high - immediate scaling recommended',
                action: 'scale_up'
            });
        } else if (metrics.system.cpuUsage > 70) {
            recommendations.push({
                type: 'warning',
                component: 'cpu',
                message: 'CPU usage elevated - consider scaling up',
                action: 'monitor'
            });
        }
        
        // Memory recommendations
        if (metrics.system.memoryUsage > 85) {
            recommendations.push({
                type: 'warning',
                component: 'memory',
                message: 'Memory usage high - check for memory leaks',
                action: 'investigate'
            });
        }
        
        // Response time recommendations
        if (metrics.requests.p95ResponseTime > 2000) {
            recommendations.push({
                type: 'warning',
                component: 'response_time',
                message: 'Response times slow - optimize database queries or increase cache',
                action: 'optimize'
            });
        }
        
        // Connection pool recommendations
        const totalConnections = Array.from(this.connectionPool.values())
            .reduce((sum, pool) => sum + pool.activeCount, 0);
            
        if (totalConnections > this.adaptiveSettings.poolSize * 0.8) {
            recommendations.push({
                type: 'info',
                component: 'connection_pool',
                message: 'Connection pool utilization high - pool size auto-adjusted',
                action: 'auto_adjusted'
            });
        }
        
        return recommendations;
    }

    /**
     * Optimize system performance
     */
    async optimize() {
        const recommendations = this.getRecommendations();
        const optimizations = [];
        
        for (const rec of recommendations) {
            switch (rec.action) {
                case 'scale_up':
                    if (cluster.isMaster) {
                        this._scaleUp({ reason: 'manual_optimization' });
                        optimizations.push('Scaled up worker processes');
                    }
                    break;
                    
                case 'auto_adjusted':
                    // Pool size already auto-adjusted
                    optimizations.push('Connection pool size optimized');
                    break;
                    
                default:
                    optimizations.push(`Recommendation: ${rec.message}`);
            }
        }
        
        perfLogger.info('Performance optimization completed', {
            recommendations: recommendations.length,
            optimizations: optimizations.length,
            actions: optimizations
        });
        
        return {
            recommendations,
            optimizations,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Shutdown performance service
     */
    async shutdown() {
        perfLogger.info('Performance service shutting down', {
            finalMetrics: this.getMetrics()
        });
        
        this.removeAllListeners();
    }
}

module.exports = PerformanceService;