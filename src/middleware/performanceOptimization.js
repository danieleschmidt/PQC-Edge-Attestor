/**
 * @file performanceOptimization.js
 * @brief Advanced performance optimization suite for Generation 3
 */

const winston = require('winston');
const cluster = require('cluster');
const os = require('os');
const { Worker } = require('worker_threads');

// Performance logger
const logger = winston.createLogger({
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

class PerformanceOptimizer {
    constructor() {
        this.metrics = {
            requestTimes: [],
            memoryUsage: [],
            cpuUsage: [],
            eventLoopLag: [],
            gcMetrics: {
                majorCollections: 0,
                minorCollections: 0,
                totalGCTime: 0
            }
        };

        this.workerPool = new Map();
        this.optimizationStrategies = new Map();
        
        // Start performance monitoring
        this.startMonitoring();
        this.setupGCMetrics();
    }

    startMonitoring() {
        // Monitor event loop lag
        setInterval(() => {
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
                this.metrics.eventLoopLag.push(lag);
                
                // Keep only last 100 measurements
                if (this.metrics.eventLoopLag.length > 100) {
                    this.metrics.eventLoopLag.shift();
                }
                
                // Alert on high lag
                if (lag > 100) { // 100ms threshold
                    logger.warn('High event loop lag detected', { lag });
                }
            });
        }, 1000);

        // Monitor memory usage
        setInterval(() => {
            const memUsage = process.memoryUsage();
            this.metrics.memoryUsage.push({
                timestamp: Date.now(),
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss
            });

            // Keep only last 60 measurements (1 hour at 1min intervals)
            if (this.metrics.memoryUsage.length > 60) {
                this.metrics.memoryUsage.shift();
            }

            // Memory leak detection
            const heapGrowth = this.detectMemoryLeak();
            if (heapGrowth > 0.1) { // 10% growth threshold
                logger.warn('Potential memory leak detected', { heapGrowth });
            }
        }, 60000); // Every minute

        // Monitor CPU usage
        let lastCPUUsage = process.cpuUsage();
        setInterval(() => {
            const currentCPUUsage = process.cpuUsage(lastCPUUsage);
            const cpuPercent = (currentCPUUsage.user + currentCPUUsage.system) / 1000000 * 100; // Convert to percentage

            this.metrics.cpuUsage.push({
                timestamp: Date.now(),
                user: currentCPUUsage.user,
                system: currentCPUUsage.system,
                percent: cpuPercent
            });

            if (this.metrics.cpuUsage.length > 60) {
                this.metrics.cpuUsage.shift();
            }

            lastCPUUsage = process.cpuUsage();
        }, 60000);
    }

    setupGCMetrics() {
        // Monitor garbage collection (if available)
        if (global.gc) {
            const originalGC = global.gc;
            global.gc = () => {
                const start = process.hrtime.bigint();
                const result = originalGC();
                const gcTime = Number(process.hrtime.bigint() - start) / 1000000;
                
                this.metrics.gcMetrics.totalGCTime += gcTime;
                this.metrics.gcMetrics.majorCollections++;
                
                logger.debug('Manual GC triggered', { gcTime });
                return result;
            };
        }
    }

    detectMemoryLeak() {
        if (this.metrics.memoryUsage.length < 10) return 0;
        
        const recent = this.metrics.memoryUsage.slice(-10);
        const oldest = recent[0];
        const newest = recent[recent.length - 1];
        
        return (newest.heapUsed - oldest.heapUsed) / oldest.heapUsed;
    }

    // Request timing middleware
    requestTimer() {
        return (req, res, next) => {
            const startTime = process.hrtime.bigint();
            
            // Capture response end to measure total time
            const originalEnd = res.end;
            res.end = function(...args) {
                const endTime = process.hrtime.bigint();
                const requestTime = Number(endTime - startTime) / 1000000; // Convert to ms
                
                // Store metrics
                performance.metrics.requestTimes.push({
                    timestamp: Date.now(),
                    duration: requestTime,
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode
                });
                
                // Keep only last 1000 requests
                if (performance.metrics.requestTimes.length > 1000) {
                    performance.metrics.requestTimes.shift();
                }
                
                // Add timing header
                res.setHeader('X-Response-Time', `${requestTime.toFixed(2)}ms`);
                
                // Alert on slow requests
                if (requestTime > 1000) { // 1 second threshold
                    logger.warn('Slow request detected', { 
                        method: req.method,
                        path: req.path,
                        duration: requestTime
                    });
                }
                
                return originalEnd.apply(this, args);
            };
            
            next();
        };
    }

    // CPU-intensive task offloading
    async createWorkerPool(poolName, workerScript, poolSize = os.cpus().length) {
        const workers = [];
        
        for (let i = 0; i < poolSize; i++) {
            const worker = new Worker(workerScript);
            workers.push({
                worker,
                busy: false,
                tasksCompleted: 0
            });
        }
        
        this.workerPool.set(poolName, workers);
        logger.info(`Created worker pool '${poolName}' with ${poolSize} workers`);
        
        return poolName;
    }

    async executeInWorkerPool(poolName, task, timeout = 30000) {
        const workers = this.workerPool.get(poolName);
        if (!workers) {
            throw new Error(`Worker pool '${poolName}' not found`);
        }

        // Find available worker
        const availableWorker = workers.find(w => !w.busy);
        if (!availableWorker) {
            throw new Error(`No available workers in pool '${poolName}'`);
        }

        availableWorker.busy = true;
        
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                availableWorker.busy = false;
                reject(new Error('Worker task timeout'));
            }, timeout);

            availableWorker.worker.postMessage(task);
            
            availableWorker.worker.once('message', (result) => {
                clearTimeout(timeoutId);
                availableWorker.busy = false;
                availableWorker.tasksCompleted++;
                
                if (result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result.data);
                }
            });
        });
    }

    // Adaptive response compression
    adaptiveCompression() {
        return (req, res, next) => {
            const originalJson = res.json;
            
            res.json = function(data) {
                const dataSize = JSON.stringify(data).length;
                const clientSupportsCompression = req.headers['accept-encoding']?.includes('gzip');
                
                // Apply compression for responses > 1KB if client supports it
                if (dataSize > 1024 && clientSupportsCompression) {
                    res.setHeader('Content-Encoding', 'gzip');
                    res.setHeader('X-Compression-Applied', 'true');
                    res.setHeader('X-Original-Size', dataSize);
                }
                
                return originalJson.call(this, data);
            };
            
            next();
        };
    }

    // Connection pooling optimizer
    optimizeConnectionPooling(poolOptions = {}) {
        const defaultOptions = {
            minConnections: 2,
            maxConnections: 10,
            acquireTimeoutMillis: 30000,
            idleTimeoutMillis: 300000
        };
        
        const options = { ...defaultOptions, ...poolOptions };
        
        // Adjust pool size based on current load
        const currentLoad = this.getCurrentLoad();
        if (currentLoad > 0.8) {
            options.maxConnections = Math.min(options.maxConnections * 2, 50);
        } else if (currentLoad < 0.3) {
            options.maxConnections = Math.max(Math.floor(options.maxConnections * 0.7), 2);
        }
        
        logger.info('Connection pool optimized', { options, currentLoad });
        return options;
    }

    getCurrentLoad() {
        const recentRequests = this.metrics.requestTimes.slice(-100);
        if (recentRequests.length === 0) return 0;
        
        const averageResponseTime = recentRequests.reduce((sum, req) => sum + req.duration, 0) / recentRequests.length;
        const recentEventLoopLag = this.metrics.eventLoopLag.slice(-10);
        const averageLag = recentEventLoopLag.reduce((sum, lag) => sum + lag, 0) / recentEventLoopLag.length;
        
        // Normalize to 0-1 scale
        const responseTimeLoad = Math.min(averageResponseTime / 1000, 1); // 1 second = full load
        const eventLoopLoad = Math.min(averageLag / 100, 1); // 100ms = full load
        
        return Math.max(responseTimeLoad, eventLoopLoad);
    }

    // Memory optimization strategies
    optimizeMemory() {
        const memUsage = process.memoryUsage();
        const heapUtilization = memUsage.heapUsed / memUsage.heapTotal;
        
        // Trigger GC if heap utilization is high
        if (heapUtilization > 0.8 && global.gc) {
            logger.info('Triggering garbage collection due to high heap utilization', { heapUtilization });
            global.gc();
        }
        
        // Memory optimization strategies
        const strategies = [];
        
        if (heapUtilization > 0.7) {
            strategies.push('reduce-cache-size');
            strategies.push('compress-payloads');
        }
        
        if (memUsage.external > 100 * 1024 * 1024) { // 100MB
            strategies.push('optimize-buffers');
        }
        
        return {
            heapUtilization,
            strategies,
            recommendations: this.getMemoryRecommendations(memUsage)
        };
    }

    getMemoryRecommendations(memUsage) {
        const recommendations = [];
        const heapRatio = memUsage.heapUsed / memUsage.heapTotal;
        const rssRatio = memUsage.rss / (os.totalmem());
        
        if (heapRatio > 0.8) {
            recommendations.push('Increase heap size or optimize memory usage');
        }
        
        if (rssRatio > 0.5) {
            recommendations.push('High RSS usage detected, check for memory leaks');
        }
        
        if (memUsage.external > memUsage.heapUsed) {
            recommendations.push('High external memory usage, review buffer usage');
        }
        
        return recommendations;
    }

    // Dynamic cluster scaling
    setupClusterOptimization() {
        if (cluster.isMaster || cluster.isPrimary) {
            const numCPUs = os.cpus().length;
            let workers = Math.min(numCPUs, 4); // Start conservative
            
            // Monitor worker performance
            setInterval(() => {
                const currentLoad = this.getCurrentLoad();
                const targetWorkers = this.calculateOptimalWorkers(currentLoad, numCPUs);
                
                if (targetWorkers > Object.keys(cluster.workers).length) {
                    // Scale up
                    for (let i = 0; i < targetWorkers - Object.keys(cluster.workers).length; i++) {
                        cluster.fork();
                        logger.info('Scaled up: added worker');
                    }
                } else if (targetWorkers < Object.keys(cluster.workers).length) {
                    // Scale down
                    const workersToKill = Object.keys(cluster.workers).length - targetWorkers;
                    Object.values(cluster.workers).slice(-workersToKill).forEach(worker => {
                        worker.kill();
                        logger.info('Scaled down: removed worker');
                    });
                }
            }, 60000); // Check every minute
        }
    }

    calculateOptimalWorkers(currentLoad, maxWorkers) {
        if (currentLoad > 0.8) return maxWorkers;
        if (currentLoad > 0.6) return Math.ceil(maxWorkers * 0.75);
        if (currentLoad > 0.4) return Math.ceil(maxWorkers * 0.5);
        return Math.max(2, Math.ceil(maxWorkers * 0.25)); // Minimum 2 workers
    }

    // Performance metrics endpoint
    getPerformanceMetrics() {
        const recentRequests = this.metrics.requestTimes.slice(-100);
        const recentLag = this.metrics.eventLoopLag.slice(-10);
        const recentMemory = this.metrics.memoryUsage.slice(-10);
        const recentCPU = this.metrics.cpuUsage.slice(-10);
        
        return {
            requests: {
                total: this.metrics.requestTimes.length,
                averageResponseTime: recentRequests.length > 0 ? 
                    recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length : 0,
                slowRequests: recentRequests.filter(r => r.duration > 1000).length,
                errorRate: recentRequests.length > 0 ?
                    recentRequests.filter(r => r.statusCode >= 400).length / recentRequests.length * 100 : 0
            },
            eventLoop: {
                averageLag: recentLag.length > 0 ? 
                    recentLag.reduce((sum, l) => sum + l, 0) / recentLag.length : 0,
                maxLag: recentLag.length > 0 ? Math.max(...recentLag) : 0
            },
            memory: {
                current: process.memoryUsage(),
                trend: recentMemory.length > 1 ? 
                    recentMemory[recentMemory.length - 1].heapUsed - recentMemory[0].heapUsed : 0
            },
            cpu: {
                averagePercent: recentCPU.length > 0 ?
                    recentCPU.reduce((sum, c) => sum + c.percent, 0) / recentCPU.length : 0
            },
            gc: this.metrics.gcMetrics,
            load: this.getCurrentLoad(),
            optimization: this.optimizeMemory()
        };
    }

    // Cleanup resources
    destroy() {
        // Close all worker pools
        for (const workers of this.workerPool.values()) {
            workers.forEach(({ worker }) => worker.terminate());
        }
        this.workerPool.clear();
    }
}

// Global performance optimizer instance
const performance = new PerformanceOptimizer();

module.exports = {
    PerformanceOptimizer,
    performance
};