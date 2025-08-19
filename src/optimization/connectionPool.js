/**
 * @file connectionPool.js
 * @brief Generation 3 connection pooling for network operations and resource management
 */

const EventEmitter = require('events');
const { CircuitBreaker } = require('../middleware/circuitBreaker');

/**
 * @class ConnectionPool
 * @brief High-performance connection pool with auto-scaling and health monitoring
 */
class ConnectionPool extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            // Pool configuration
            initialSize: options.initialSize || 5,
            minSize: options.minSize || 2,
            maxSize: options.maxSize || 20,
            maxIdleTime: options.maxIdleTime || 300000, // 5 minutes
            maxWaitTime: options.maxWaitTime || 30000, // 30 seconds
            
            // Health checking
            healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            
            // Auto-scaling
            enableAutoScaling: options.enableAutoScaling !== false,
            scaleUpThreshold: options.scaleUpThreshold || 0.80, // 80% utilization
            scaleDownThreshold: options.scaleDownThreshold || 0.30, // 30% utilization
            scalingCooldown: options.scalingCooldown || 60000, // 1 minute
            
            // Connection factory
            createConnection: options.createConnection,
            destroyConnection: options.destroyConnection,
            validateConnection: options.validateConnection,
            
            // Circuit breaker
            enableCircuitBreaker: options.enableCircuitBreaker !== false,
            
            ...options
        };

        // Pool state
        this.connections = new Map();
        this.availableConnections = [];
        this.waitingQueue = [];
        this.connectionCounter = 0;
        this.lastScalingAction = 0;
        
        // Statistics
        this.stats = {
            created: 0,
            destroyed: 0,
            borrowed: 0,
            returned: 0,
            failed: 0,
            timeouts: 0,
            totalRequests: 0,
            avgWaitTime: 0,
            maxConnections: 0,
            currentActive: 0,
            healthCheckPassed: 0,
            healthCheckFailed: 0
        };

        // Health monitoring
        this.healthCheckTimer = null;
        this.isHealthy = true;

        // Circuit breaker for connection operations
        this.circuitBreaker = this.options.enableCircuitBreaker ? 
            new CircuitBreaker({
                serviceName: 'connection-pool',
                failureThreshold: 5,
                timeout: this.options.maxWaitTime
            }) : null;

        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Validate required options
            if (!this.options.createConnection || typeof this.options.createConnection !== 'function') {
                throw new Error('createConnection function is required');
            }

            // Create initial connections
            await this._createInitialConnections();

            // Start health monitoring
            this._startHealthMonitoring();

            this.initialized = true;
            this.emit('initialized', {
                poolSize: this.connections.size,
                available: this.availableConnections.length
            });

        } catch (error) {
            throw new Error(`Connection pool initialization failed: ${error.message}`);
        }
    }

    async acquire(timeout = this.options.maxWaitTime) {
        if (!this.initialized) {
            throw new Error('Connection pool not initialized');
        }

        this.stats.totalRequests++;
        const startTime = Date.now();

        try {
            const connection = await this._acquireConnection(timeout);
            const waitTime = Date.now() - startTime;
            
            // Update average wait time
            this.stats.avgWaitTime = (this.stats.avgWaitTime * 0.9) + (waitTime * 0.1);
            this.stats.borrowed++;
            this.stats.currentActive++;

            this.emit('connection-acquired', { 
                connectionId: connection.id, 
                waitTime,
                poolStats: this._getPoolStats()
            });

            return connection;

        } catch (error) {
            this.stats.failed++;
            this.emit('acquisition-failed', { error: error.message, timeout });
            throw error;
        }
    }

    async release(connection) {
        if (!connection || !this.connections.has(connection.id)) {
            throw new Error('Invalid connection or connection not from this pool');
        }

        try {
            const poolConnection = this.connections.get(connection.id);
            
            // Reset connection state
            poolConnection.lastUsed = Date.now();
            poolConnection.inUse = false;
            poolConnection.errorCount = 0;

            // Validate connection health
            if (await this._validateConnection(connection)) {
                this.availableConnections.push(poolConnection);
                this.stats.returned++;
                this.stats.currentActive--;

                // Process waiting queue
                this._processWaitingQueue();

                this.emit('connection-released', { 
                    connectionId: connection.id,
                    poolStats: this._getPoolStats()
                });

                // Check if we should scale down
                if (this.options.enableAutoScaling) {
                    this._checkScaleDown();
                }

            } else {
                // Connection is unhealthy, destroy it
                await this._destroyConnection(poolConnection);
                this.emit('connection-destroyed', { 
                    connectionId: connection.id, 
                    reason: 'failed-validation' 
                });
            }

        } catch (error) {
            this.emit('release-error', { 
                connectionId: connection.id, 
                error: error.message 
            });
            throw error;
        }
    }

    async drain() {
        this.emit('drain-started');

        // Stop accepting new requests
        this.initialized = false;

        // Wait for active connections to be returned
        while (this.stats.currentActive > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Destroy all connections
        const destroyPromises = Array.from(this.connections.values()).map(conn => 
            this._destroyConnection(conn)
        );

        await Promise.all(destroyPromises);

        this.emit('drain-complete');
    }

    async cleanup() {
        // Stop health monitoring
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        // Drain all connections
        await this.drain();

        // Cleanup circuit breaker
        if (this.circuitBreaker && this.circuitBreaker.cleanup) {
            this.circuitBreaker.cleanup();
        }

        this.emit('cleanup-complete');
    }

    getStats() {
        return {
            ...this.stats,
            pool: this._getPoolStats(),
            healthy: this.isHealthy,
            utilization: this._getUtilization()
        };
    }

    async scale(targetSize) {
        const currentSize = this.connections.size;
        
        if (targetSize === currentSize) {
            return true;
        }

        try {
            if (targetSize > currentSize) {
                // Scale up
                const connectionsToAdd = Math.min(
                    targetSize - currentSize,
                    this.options.maxSize - currentSize
                );
                
                await this._addConnections(connectionsToAdd);
                
            } else {
                // Scale down
                const connectionsToRemove = Math.min(
                    currentSize - targetSize,
                    currentSize - this.options.minSize
                );
                
                await this._removeConnections(connectionsToRemove);
            }

            this.lastScalingAction = Date.now();
            this.emit('pool-scaled', { 
                from: currentSize, 
                to: this.connections.size,
                target: targetSize
            });

            return true;

        } catch (error) {
            this.emit('scaling-error', { error: error.message, targetSize });
            return false;
        }
    }

    // Private methods

    async _createInitialConnections() {
        const promises = [];
        for (let i = 0; i < this.options.initialSize; i++) {
            promises.push(this._createConnection());
        }

        await Promise.all(promises);
    }

    async _createConnection() {
        try {
            const id = `conn-${++this.connectionCounter}`;
            const rawConnection = await this.options.createConnection();
            
            const poolConnection = {
                id,
                connection: rawConnection,
                created: Date.now(),
                lastUsed: Date.now(),
                inUse: false,
                errorCount: 0,
                healthy: true
            };

            this.connections.set(id, poolConnection);
            this.availableConnections.push(poolConnection);
            this.stats.created++;
            this.stats.maxConnections = Math.max(this.stats.maxConnections, this.connections.size);

            this.emit('connection-created', { connectionId: id });
            return poolConnection;

        } catch (error) {
            this.stats.failed++;
            this.emit('connection-creation-failed', { error: error.message });
            throw error;
        }
    }

    async _destroyConnection(poolConnection) {
        try {
            // Remove from available connections
            const availableIndex = this.availableConnections.indexOf(poolConnection);
            if (availableIndex >= 0) {
                this.availableConnections.splice(availableIndex, 1);
            }

            // Remove from connections map
            this.connections.delete(poolConnection.id);

            // Destroy the actual connection
            if (this.options.destroyConnection) {
                await this.options.destroyConnection(poolConnection.connection);
            }

            this.stats.destroyed++;
            this.emit('connection-destroyed', { connectionId: poolConnection.id });

        } catch (error) {
            this.emit('connection-destruction-failed', { 
                connectionId: poolConnection.id, 
                error: error.message 
            });
        }
    }

    async _acquireConnection(timeout) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                // Remove from waiting queue
                const queueIndex = this.waitingQueue.findIndex(item => item.resolve === resolve);
                if (queueIndex >= 0) {
                    this.waitingQueue.splice(queueIndex, 1);
                }
                
                this.stats.timeouts++;
                reject(new Error(`Connection acquisition timeout after ${timeout}ms`));
            }, timeout);

            const attemptAcquisition = async () => {
                try {
                    // Check for available connection
                    if (this.availableConnections.length > 0) {
                        const poolConnection = this.availableConnections.shift();
                        poolConnection.inUse = true;
                        poolConnection.lastUsed = Date.now();

                        clearTimeout(timeoutId);
                        resolve(poolConnection.connection);
                        return;
                    }

                    // Try to create new connection if under max limit
                    if (this.connections.size < this.options.maxSize) {
                        const poolConnection = await this._createConnection();
                        poolConnection.inUse = true;
                        
                        // Remove from available since we're using it immediately
                        const availableIndex = this.availableConnections.indexOf(poolConnection);
                        if (availableIndex >= 0) {
                            this.availableConnections.splice(availableIndex, 1);
                        }

                        clearTimeout(timeoutId);
                        resolve(poolConnection.connection);
                        return;
                    }

                    // Add to waiting queue
                    this.waitingQueue.push({ resolve, reject, timeoutId });

                    // Check if we should scale up
                    if (this.options.enableAutoScaling) {
                        this._checkScaleUp();
                    }

                } catch (error) {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            };

            if (this.circuitBreaker) {
                this.circuitBreaker.execute(attemptAcquisition).catch(reject);
            } else {
                attemptAcquisition().catch(reject);
            }
        });
    }

    _processWaitingQueue() {
        while (this.waitingQueue.length > 0 && this.availableConnections.length > 0) {
            const { resolve, timeoutId } = this.waitingQueue.shift();
            const poolConnection = this.availableConnections.shift();
            
            poolConnection.inUse = true;
            poolConnection.lastUsed = Date.now();
            
            clearTimeout(timeoutId);
            resolve(poolConnection.connection);
        }
    }

    async _validateConnection(connection) {
        if (!this.options.validateConnection) {
            return true; // No validation function provided
        }

        try {
            return await this.options.validateConnection(connection);
        } catch (error) {
            return false;
        }
    }

    _startHealthMonitoring() {
        this.healthCheckTimer = setInterval(async () => {
            await this._performHealthCheck();
        }, this.options.healthCheckInterval);
    }

    async _performHealthCheck() {
        let healthyCount = 0;
        let unhealthyConnections = [];

        for (const poolConnection of this.connections.values()) {
            if (!poolConnection.inUse) {
                try {
                    const isHealthy = await this._validateConnection(poolConnection.connection);
                    
                    if (isHealthy) {
                        healthyCount++;
                        poolConnection.healthy = true;
                        poolConnection.errorCount = 0;
                        this.stats.healthCheckPassed++;
                    } else {
                        poolConnection.healthy = false;
                        poolConnection.errorCount++;
                        unhealthyConnections.push(poolConnection);
                        this.stats.healthCheckFailed++;
                    }
                } catch (error) {
                    poolConnection.healthy = false;
                    poolConnection.errorCount++;
                    unhealthyConnections.push(poolConnection);
                    this.stats.healthCheckFailed++;
                }
            }
        }

        // Remove unhealthy connections
        for (const unhealthyConn of unhealthyConnections) {
            if (unhealthyConn.errorCount >= this.options.maxRetries) {
                await this._destroyConnection(unhealthyConn);
                this.emit('unhealthy-connection-removed', { 
                    connectionId: unhealthyConn.id 
                });
            }
        }

        // Update pool health status
        const totalConnections = this.connections.size;
        this.isHealthy = totalConnections > 0 && (healthyCount / totalConnections) >= 0.5;

        this.emit('health-check-complete', {
            healthy: healthyCount,
            unhealthy: unhealthyConnections.length,
            poolHealthy: this.isHealthy
        });
    }

    _checkScaleUp() {
        const now = Date.now();
        if (now - this.lastScalingAction < this.options.scalingCooldown) {
            return; // Still in cooldown
        }

        const utilization = this._getUtilization();
        if (utilization > this.options.scaleUpThreshold && this.connections.size < this.options.maxSize) {
            const targetSize = Math.min(
                this.connections.size + Math.ceil(this.connections.size * 0.5),
                this.options.maxSize
            );
            
            this.scale(targetSize);
        }
    }

    _checkScaleDown() {
        const now = Date.now();
        if (now - this.lastScalingAction < this.options.scalingCooldown) {
            return; // Still in cooldown
        }

        const utilization = this._getUtilization();
        if (utilization < this.options.scaleDownThreshold && this.connections.size > this.options.minSize) {
            const targetSize = Math.max(
                this.connections.size - Math.ceil(this.connections.size * 0.25),
                this.options.minSize
            );
            
            this.scale(targetSize);
        }
    }

    async _addConnections(count) {
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(this._createConnection());
        }
        
        await Promise.all(promises);
    }

    async _removeConnections(count) {
        const toRemove = [];
        
        // Remove oldest idle connections first
        const sortedConnections = this.availableConnections
            .sort((a, b) => a.lastUsed - b.lastUsed)
            .slice(0, count);
            
        for (const conn of sortedConnections) {
            toRemove.push(this._destroyConnection(conn));
        }
        
        await Promise.all(toRemove);
    }

    _getPoolStats() {
        return {
            total: this.connections.size,
            available: this.availableConnections.length,
            inUse: this.stats.currentActive,
            waiting: this.waitingQueue.length
        };
    }

    _getUtilization() {
        if (this.connections.size === 0) return 0;
        return this.stats.currentActive / this.connections.size;
    }
}

module.exports = { ConnectionPool };