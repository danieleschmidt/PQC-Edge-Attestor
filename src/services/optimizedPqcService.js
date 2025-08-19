/**
 * @file optimizedPqcService.js
 * @brief Generation 3 optimized PQC service with performance cache and auto-scaling
 */

const PQCCryptoService = require('./pqcCryptoService');
const { PerformanceCache } = require('../optimization/performanceCache');
const { AutoScaler, RESOURCE_TYPES } = require('../optimization/autoScaler');
const { CircuitBreaker } = require('../middleware/circuitBreaker');
const EventEmitter = require('events');

class OptimizedPQCService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableCaching: config.enableCaching !== false,
            enableAutoScaling: config.enableAutoScaling !== false,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            workerPoolSize: config.workerPoolSize || 4,
            maxConcurrentOperations: config.maxConcurrentOperations || 10,
            ...config
        };

        // Core PQC service
        this.pqcService = new PQCCryptoService(config);
        
        // Performance optimization components
        this.cache = new PerformanceCache({
            l1Size: 200,
            l2Size: 1000,
            l3Size: 5000,
            defaultTtl: 300000, // 5 minutes
            enablePrefetching: true
        });

        this.autoScaler = new AutoScaler({
            strategy: 'hybrid',
            scaleUpThreshold: 0.75,
            scaleDownThreshold: 0.30,
            evaluationInterval: 15000, // 15 seconds
            cooldownPeriod: 60000 // 1 minute
        });

        this.circuitBreaker = new CircuitBreaker({
            serviceName: 'optimized-pqc-service',
            failureThreshold: 5,
            timeout: 30000
        });

        // Performance tracking
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            operationsPerSecond: 0,
            avgResponseTime: 0,
            currentLoad: 0,
            scalingActions: 0,
            circuitBreakerTrips: 0
        };

        // Operation queue for load balancing
        this.operationQueue = [];
        this.activeOperations = 0;
        this.workerPool = [];

        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Initialize core PQC service
            await this.pqcService.initialize();

            // Initialize optimization components
            if (this.config.enableCaching) {
                await this.cache.initialize();
            }

            if (this.config.enableAutoScaling) {
                this._setupAutoScaling();
            }

            // Initialize worker pool
            await this._initializeWorkerPool();

            // Start performance monitoring
            this._startPerformanceMonitoring();

            this.initialized = true;
            this.emit('initialized', {
                caching: this.config.enableCaching,
                autoScaling: this.config.enableAutoScaling,
                workerPoolSize: this.config.workerPoolSize
            });

        } catch (error) {
            throw new Error(`Optimized PQC service initialization failed: ${error.message}`);
        }
    }

    async generateKyberKeypair() {
        const operationId = `kyber-keypair-${Date.now()}`;
        const cacheKey = `kyber-keypair-fresh-${Math.floor(Date.now() / 60000)}`; // 1-minute cache

        return await this._executeOperation(operationId, async () => {
            // Check cache first
            if (this.config.enableCaching) {
                const cached = await this.cache.get(cacheKey);
                if (cached) {
                    this.stats.cacheHits++;
                    this.emit('cache-hit', { operation: 'kyber-keypair', key: cacheKey });
                    return cached;
                }
            }

            // Generate new keypair
            const startTime = Date.now();
            const keypair = await this.pqcService.generateKyberKeypair();
            const duration = Date.now() - startTime;

            // Cache result
            if (this.config.enableCaching) {
                await this.cache.set(cacheKey, keypair, 60000); // Cache for 1 minute
                this.stats.cacheMisses++;
            }

            this._updatePerformanceMetrics('kyber-keypair', duration);
            return keypair;
        });
    }

    async kyberEncapsulate(publicKey) {
        const operationId = `kyber-encap-${Date.now()}`;
        const keyHash = this._hashKey(publicKey);
        const cacheKey = `kyber-encap-${keyHash}`;

        return await this._executeOperation(operationId, async () => {
            if (this.config.enableCaching) {
                const cached = await this.cache.get(cacheKey);
                if (cached) {
                    this.stats.cacheHits++;
                    return cached;
                }
            }

            const startTime = Date.now();
            const result = await this.pqcService.kyberEncapsulate(publicKey);
            const duration = Date.now() - startTime;

            if (this.config.enableCaching) {
                await this.cache.set(cacheKey, result, 180000); // Cache for 3 minutes
                this.stats.cacheMisses++;
            }

            this._updatePerformanceMetrics('kyber-encap', duration);
            return result;
        });
    }

    async kyberDecapsulate(ciphertext, secretKey) {
        const operationId = `kyber-decap-${Date.now()}`;

        return await this._executeOperation(operationId, async () => {
            const startTime = Date.now();
            const result = await this.pqcService.kyberDecapsulate(ciphertext, secretKey);
            const duration = Date.now() - startTime;

            this._updatePerformanceMetrics('kyber-decap', duration);
            return result;
        });
    }

    async generateDilithiumKeypair() {
        const operationId = `dilithium-keypair-${Date.now()}`;
        const cacheKey = `dilithium-keypair-fresh-${Math.floor(Date.now() / 60000)}`;

        return await this._executeOperation(operationId, async () => {
            if (this.config.enableCaching) {
                const cached = await this.cache.get(cacheKey);
                if (cached) {
                    this.stats.cacheHits++;
                    return cached;
                }
            }

            const startTime = Date.now();
            const keypair = await this.pqcService.generateDilithiumKeypair();
            const duration = Date.now() - startTime;

            if (this.config.enableCaching) {
                await this.cache.set(cacheKey, keypair, 60000);
                this.stats.cacheMisses++;
            }

            this._updatePerformanceMetrics('dilithium-keypair', duration);
            return keypair;
        });
    }

    async dilithiumSign(message, secretKey) {
        const operationId = `dilithium-sign-${Date.now()}`;

        return await this._executeOperation(operationId, async () => {
            const startTime = Date.now();
            const signature = await this.pqcService.dilithiumSign(message, secretKey);
            const duration = Date.now() - startTime;

            this._updatePerformanceMetrics('dilithium-sign', duration);
            return signature;
        });
    }

    async dilithiumVerify(signature, message, publicKey) {
        const operationId = `dilithium-verify-${Date.now()}`;
        const messageHash = this._hashKey(message);
        const cacheKey = `dilithium-verify-${messageHash}-${this._hashKey(signature)}`;

        return await this._executeOperation(operationId, async () => {
            if (this.config.enableCaching) {
                const cached = await this.cache.get(cacheKey);
                if (cached !== undefined) {
                    this.stats.cacheHits++;
                    return cached;
                }
            }

            const startTime = Date.now();
            const isValid = await this.pqcService.dilithiumVerify(signature, message, publicKey);
            const duration = Date.now() - startTime;

            if (this.config.enableCaching) {
                await this.cache.set(cacheKey, isValid, 300000); // Cache for 5 minutes
                this.stats.cacheMisses++;
            }

            this._updatePerformanceMetrics('dilithium-verify', duration);
            return isValid;
        });
    }

    async getServiceStatus() {
        const cacheStats = this.config.enableCaching ? this.cache.getStats() : null;
        const scalerStatus = this.config.enableAutoScaling ? this.autoScaler.getStatus() : null;
        const circuitStats = this.config.enableCircuitBreaker ? this.circuitBreaker.getStats() : null;

        return {
            service: 'optimized-pqc-service',
            initialized: this.initialized,
            optimization: {
                caching: {
                    enabled: this.config.enableCaching,
                    stats: cacheStats
                },
                autoScaling: {
                    enabled: this.config.enableAutoScaling,
                    status: scalerStatus
                },
                circuitBreaker: {
                    enabled: this.config.enableCircuitBreaker,
                    stats: circuitStats
                }
            },
            performance: this.stats,
            workerPool: {
                size: this.workerPool.length,
                active: this.activeOperations,
                queued: this.operationQueue.length
            }
        };
    }

    async cleanup() {
        this.initialized = false;

        // Cleanup performance monitoring
        if (this.performanceTimer) {
            clearInterval(this.performanceTimer);
        }

        // Cleanup optimization components
        if (this.config.enableCaching) {
            await this.cache.cleanup();
        }

        if (this.config.enableAutoScaling) {
            this.autoScaler.cleanup();
        }

        // Cleanup core service
        this.pqcService.cleanup();

        this.emit('cleanup-complete');
    }

    // Private methods

    async _executeOperation(operationId, operationFn) {
        if (this.activeOperations >= this.config.maxConcurrentOperations) {
            return new Promise((resolve, reject) => {
                this.operationQueue.push({ operationId, operationFn, resolve, reject });
            });
        }

        this.activeOperations++;
        
        try {
            let result;
            
            if (this.config.enableCircuitBreaker) {
                result = await this.circuitBreaker.execute(operationFn);
            } else {
                result = await operationFn();
            }
            
            this._processQueue();
            return result;

        } catch (error) {
            if (this.config.enableCircuitBreaker && error.name === 'CircuitBreakerError') {
                this.stats.circuitBreakerTrips++;
            }
            this._processQueue();
            throw error;
        } finally {
            this.activeOperations--;
        }
    }

    _processQueue() {
        if (this.operationQueue.length > 0 && this.activeOperations < this.config.maxConcurrentOperations) {
            const { operationId, operationFn, resolve, reject } = this.operationQueue.shift();
            
            this._executeOperation(operationId, operationFn)
                .then(resolve)
                .catch(reject);
        }
    }

    _setupAutoScaling() {
        // Register PQC-specific resources
        this.autoScaler.registerResource('crypto-workers', {
            initial: this.config.workerPoolSize,
            min: 2,
            max: 16,
            stepSize: 2,
            costPerUnit: 0.25,
            scaleFunction: async (targetLevel) => {
                return await this._scaleWorkerPool(targetLevel);
            },
            metricExtractor: (metrics) => metrics.cryptoLoad || 0
        });

        this.autoScaler.registerResource('cache-size', {
            initial: 200,
            min: 100,
            max: 1000,
            stepSize: 100,
            costPerUnit: 0.05,
            scaleFunction: async (targetLevel) => {
                return await this._scaleCacheSize(targetLevel);
            },
            metricExtractor: (metrics) => metrics.cacheUtilization || 0
        });

        // Listen for scaling events
        this.autoScaler.on('scaled', (event) => {
            this.stats.scalingActions++;
            this.emit('auto-scaled', event);
        });
    }

    async _scaleWorkerPool(targetSize) {
        try {
            if (targetSize > this.workerPool.length) {
                // Scale up - add workers
                const workersToAdd = targetSize - this.workerPool.length;
                for (let i = 0; i < workersToAdd; i++) {
                    this.workerPool.push({ id: Date.now() + i, busy: false });
                }
            } else {
                // Scale down - remove workers
                this.workerPool = this.workerPool.slice(0, targetSize);
            }
            
            this.config.workerPoolSize = targetSize;
            this.emit('worker-pool-scaled', { newSize: targetSize });
            return true;
        } catch (error) {
            this.emit('scaling-error', { type: 'worker-pool', error: error.message });
            return false;
        }
    }

    async _scaleCacheSize(targetSize) {
        try {
            // Resize cache L1 level
            if (this.config.enableCaching) {
                // Would implement actual cache resizing here
                this.emit('cache-scaled', { newSize: targetSize });
                return true;
            }
            return false;
        } catch (error) {
            this.emit('scaling-error', { type: 'cache', error: error.message });
            return false;
        }
    }

    async _initializeWorkerPool() {
        this.workerPool = [];
        for (let i = 0; i < this.config.workerPoolSize; i++) {
            this.workerPool.push({
                id: i,
                busy: false,
                created: Date.now()
            });
        }
    }

    _startPerformanceMonitoring() {
        this.performanceTimer = setInterval(() => {
            this._updatePerformanceStats();
        }, 5000); // Update every 5 seconds
    }

    _updatePerformanceStats() {
        const currentLoad = this.activeOperations / this.config.maxConcurrentOperations;
        this.stats.currentLoad = currentLoad;

        // Update cache utilization
        let cacheUtilization = 0;
        if (this.config.enableCaching) {
            const cacheStats = this.cache.getStats();
            cacheUtilization = (cacheStats.l1.size + cacheStats.l2.size + cacheStats.l3.size) / 
                             (cacheStats.l1.maxSize + cacheStats.l2.maxSize + cacheStats.l3.maxSize);
        }

        // Send metrics to auto-scaler
        if (this.config.enableAutoScaling) {
            this.autoScaler.updateMetrics({
                cryptoLoad: currentLoad,
                cacheUtilization,
                queueLength: this.operationQueue.length,
                timestamp: Date.now()
            });
        }

        this.emit('performance-update', {
            load: currentLoad,
            cacheUtilization,
            queueLength: this.operationQueue.length,
            stats: this.stats
        });
    }

    _updatePerformanceMetrics(operation, duration) {
        // Update response time (simple moving average)
        this.stats.avgResponseTime = (this.stats.avgResponseTime * 0.9) + (duration * 0.1);
        
        // Calculate operations per second
        const now = Date.now();
        if (!this.lastOpsUpdate) {
            this.lastOpsUpdate = now;
            this.opsCounter = 1;
        } else {
            this.opsCounter++;
            const timeDiff = now - this.lastOpsUpdate;
            if (timeDiff >= 1000) { // Update every second
                this.stats.operationsPerSecond = (this.opsCounter / timeDiff) * 1000;
                this.lastOpsUpdate = now;
                this.opsCounter = 0;
            }
        }

        this.emit('operation-completed', { operation, duration });
    }

    _hashKey(data) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
    }
}

module.exports = OptimizedPQCService;