/**
 * @file workerThreadPool.js
 * @brief Generation 3 worker thread pool for CPU-intensive cryptographic operations
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const EventEmitter = require('events');
const path = require('path');
const os = require('os');

/**
 * @class WorkerThreadPool
 * @brief High-performance worker thread pool for parallel crypto operations
 */
class WorkerThreadPool extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            // Pool configuration
            minWorkers: options.minWorkers || Math.max(2, Math.floor(os.cpus().length / 2)),
            maxWorkers: options.maxWorkers || os.cpus().length,
            idleTimeout: options.idleTimeout || 60000, // 1 minute
            maxQueueSize: options.maxQueueSize || 1000,
            workerScript: options.workerScript || path.join(__dirname, 'crypto-worker.js'),
            
            // Task configuration
            taskTimeout: options.taskTimeout || 30000, // 30 seconds
            maxRetries: options.maxRetries || 2,
            
            // Auto-scaling
            enableAutoScaling: options.enableAutoScaling !== false,
            scaleUpThreshold: options.scaleUpThreshold || 0.80,
            scaleDownThreshold: options.scaleDownThreshold || 0.30,
            scalingInterval: options.scalingInterval || 10000, // 10 seconds
            
            ...options
        };

        // Pool state
        this.workers = new Map();
        this.availableWorkers = [];
        this.taskQueue = [];
        this.activeTasks = new Map();
        this.workerCounter = 0;
        this.taskCounter = 0;

        // Statistics
        this.stats = {
            workersCreated: 0,
            workersDestroyed: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
            tasksQueued: 0,
            tasksTimedOut: 0,
            totalProcessingTime: 0,
            avgProcessingTime: 0,
            peakWorkers: 0,
            peakQueueSize: 0
        };

        // Auto-scaling
        this.scalingTimer = null;
        this.lastScalingAction = 0;

        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Verify worker script exists
            await this._verifyWorkerScript();

            // Create initial workers
            await this._createInitialWorkers();

            // Start auto-scaling if enabled
            if (this.options.enableAutoScaling) {
                this._startAutoScaling();
            }

            this.initialized = true;
            this.emit('initialized', {
                workers: this.workers.size,
                available: this.availableWorkers.length
            });

        } catch (error) {
            throw new Error(`Worker thread pool initialization failed: ${error.message}`);
        }
    }

    async execute(taskType, taskData, priority = 0) {
        if (!this.initialized) {
            throw new Error('Worker thread pool not initialized');
        }

        if (this.taskQueue.length >= this.options.maxQueueSize) {
            throw new Error('Task queue is full');
        }

        const taskId = `task-${++this.taskCounter}`;
        const task = {
            id: taskId,
            type: taskType,
            data: taskData,
            priority,
            created: Date.now(),
            retries: 0
        };

        return new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;

            // Add to queue (sorted by priority)
            this._addToQueue(task);
            this.stats.tasksQueued++;
            this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, this.taskQueue.length);

            // Try to process immediately
            this._processQueue();

            this.emit('task-queued', { taskId, type: taskType, queueSize: this.taskQueue.length });
        });
    }

    async terminate() {
        this.emit('termination-started');

        // Stop auto-scaling
        if (this.scalingTimer) {
            clearInterval(this.scalingTimer);
            this.scalingTimer = null;
        }

        // Cancel all queued tasks
        for (const task of this.taskQueue) {
            task.reject(new Error('Worker pool terminated'));
        }
        this.taskQueue = [];

        // Wait for active tasks to complete or timeout
        const activeTaskPromises = Array.from(this.activeTasks.values()).map(task =>
            new Promise(resolve => {
                const originalResolve = task.resolve;
                const originalReject = task.reject;
                
                task.resolve = (...args) => {
                    originalResolve(...args);
                    resolve();
                };
                task.reject = (...args) => {
                    originalReject(...args);
                    resolve();
                };

                // Force timeout after 5 seconds
                setTimeout(resolve, 5000);
            })
        );

        await Promise.all(activeTaskPromises);

        // Terminate all workers
        const terminationPromises = Array.from(this.workers.values()).map(worker =>
            this._terminateWorker(worker)
        );

        await Promise.all(terminationPromises);

        this.initialized = false;
        this.emit('termination-complete');
    }

    getStats() {
        return {
            ...this.stats,
            pool: {
                workers: this.workers.size,
                available: this.availableWorkers.length,
                busy: this.workers.size - this.availableWorkers.length,
                queueSize: this.taskQueue.length,
                activeTasks: this.activeTasks.size
            },
            utilization: this._getUtilization(),
            efficiency: this._getEfficiency()
        };
    }

    async scaleWorkers(targetSize) {
        const currentSize = this.workers.size;
        
        if (targetSize === currentSize) {
            return true;
        }

        try {
            if (targetSize > currentSize) {
                // Scale up
                const workersToAdd = Math.min(
                    targetSize - currentSize,
                    this.options.maxWorkers - currentSize
                );
                
                await this._addWorkers(workersToAdd);
                
            } else {
                // Scale down
                const workersToRemove = Math.min(
                    currentSize - targetSize,
                    currentSize - this.options.minWorkers
                );
                
                await this._removeWorkers(workersToRemove);
            }

            this.lastScalingAction = Date.now();
            this.emit('pool-scaled', { 
                from: currentSize, 
                to: this.workers.size,
                target: targetSize
            });

            return true;

        } catch (error) {
            this.emit('scaling-error', { error: error.message, targetSize });
            return false;
        }
    }

    // Private methods

    async _verifyWorkerScript() {
        const fs = require('fs').promises;
        try {
            await fs.access(this.options.workerScript);
        } catch (error) {
            // Create a basic worker script if it doesn't exist
            await this._createDefaultWorkerScript();
        }
    }

    async _createDefaultWorkerScript() {
        const fs = require('fs').promises;
        const workerCode = `
const { parentPort } = require('worker_threads');

// Basic crypto operations for worker thread
const crypto = require('crypto');

parentPort.on('message', async (message) => {
    const { taskId, type, data } = message;
    
    try {
        let result;
        
        switch (type) {
            case 'hash':
                result = crypto.createHash('sha256').update(data.input).digest('hex');
                break;
                
            case 'random':
                result = crypto.randomBytes(data.size).toString('hex');
                break;
                
            case 'pbkdf2':
                result = crypto.pbkdf2Sync(data.password, data.salt, data.iterations, data.keylen, 'sha256').toString('hex');
                break;
                
            case 'encrypt':
                const cipher = crypto.createCipher('aes256', data.key);
                result = cipher.update(data.plaintext, 'utf8', 'hex') + cipher.final('hex');
                break;
                
            case 'decrypt':
                const decipher = crypto.createDecipher('aes256', data.key);
                result = decipher.update(data.ciphertext, 'hex', 'utf8') + decipher.final('utf8');
                break;
                
            default:
                throw new Error(\`Unknown task type: \${type}\`);
        }
        
        parentPort.postMessage({
            taskId,
            success: true,
            result
        });
        
    } catch (error) {
        parentPort.postMessage({
            taskId,
            success: false,
            error: error.message
        });
    }
});

// Signal worker is ready
parentPort.postMessage({ ready: true });
`;

        await fs.writeFile(this.options.workerScript, workerCode);
    }

    async _createInitialWorkers() {
        const promises = [];
        for (let i = 0; i < this.options.minWorkers; i++) {
            promises.push(this._createWorker());
        }

        await Promise.all(promises);
    }

    async _createWorker() {
        const workerId = `worker-${++this.workerCounter}`;
        
        try {
            const worker = new Worker(this.options.workerScript);
            const workerInfo = {
                id: workerId,
                worker,
                created: Date.now(),
                lastUsed: Date.now(),
                tasksCompleted: 0,
                tasksFailed: 0,
                busy: false,
                ready: false
            };

            // Set up worker event handlers
            worker.on('message', (message) => {
                this._handleWorkerMessage(workerInfo, message);
            });

            worker.on('error', (error) => {
                this._handleWorkerError(workerInfo, error);
            });

            worker.on('exit', (code) => {
                this._handleWorkerExit(workerInfo, code);
            });

            // Wait for worker to be ready
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Worker initialization timeout'));
                }, 5000);

                const messageHandler = (message) => {
                    if (message.ready) {
                        clearTimeout(timeout);
                        worker.off('message', messageHandler);
                        resolve();
                    }
                };

                worker.on('message', messageHandler);
            });

            workerInfo.ready = true;
            this.workers.set(workerId, workerInfo);
            this.availableWorkers.push(workerInfo);
            this.stats.workersCreated++;
            this.stats.peakWorkers = Math.max(this.stats.peakWorkers, this.workers.size);

            this.emit('worker-created', { workerId });
            return workerInfo;

        } catch (error) {
            this.emit('worker-creation-failed', { workerId, error: error.message });
            throw error;
        }
    }

    async _terminateWorker(workerInfo) {
        try {
            // Remove from available workers
            const availableIndex = this.availableWorkers.indexOf(workerInfo);
            if (availableIndex >= 0) {
                this.availableWorkers.splice(availableIndex, 1);
            }

            // Terminate the worker
            await workerInfo.worker.terminate();

            // Remove from workers map
            this.workers.delete(workerInfo.id);
            this.stats.workersDestroyed++;

            this.emit('worker-terminated', { workerId: workerInfo.id });

        } catch (error) {
            this.emit('worker-termination-failed', { 
                workerId: workerInfo.id, 
                error: error.message 
            });
        }
    }

    _handleWorkerMessage(workerInfo, message) {
        if (message.ready) {
            return; // Already handled during creation
        }

        const { taskId, success, result, error } = message;
        const task = this.activeTasks.get(taskId);

        if (!task) {
            return; // Task already handled or unknown
        }

        // Clear task timeout
        if (task.timeout) {
            clearTimeout(task.timeout);
        }

        // Remove from active tasks
        this.activeTasks.delete(taskId);

        // Update worker state
        workerInfo.busy = false;
        workerInfo.lastUsed = Date.now();
        this.availableWorkers.push(workerInfo);

        // Update statistics
        const processingTime = Date.now() - task.started;
        this.stats.totalProcessingTime += processingTime;
        this.stats.avgProcessingTime = this.stats.totalProcessingTime / (this.stats.tasksCompleted + this.stats.tasksFailed + 1);

        if (success) {
            workerInfo.tasksCompleted++;
            this.stats.tasksCompleted++;
            task.resolve(result);
            this.emit('task-completed', { taskId, processingTime });
        } else {
            workerInfo.tasksFaile++;
            this.stats.tasksFailed++;
            task.reject(new Error(error));
            this.emit('task-failed', { taskId, error });
        }

        // Process next task in queue
        this._processQueue();
    }

    _handleWorkerError(workerInfo, error) {
        this.emit('worker-error', { workerId: workerInfo.id, error: error.message });
        
        // Remove failed worker
        this._terminateWorker(workerInfo);
        
        // Create replacement worker
        if (this.workers.size < this.options.minWorkers) {
            this._createWorker().catch(err => {
                this.emit('worker-replacement-failed', { error: err.message });
            });
        }
    }

    _handleWorkerExit(workerInfo, code) {
        this.emit('worker-exit', { workerId: workerInfo.id, code });
        
        // Remove from workers map if still there
        if (this.workers.has(workerInfo.id)) {
            this.workers.delete(workerInfo.id);
        }

        // Remove from available workers
        const availableIndex = this.availableWorkers.indexOf(workerInfo);
        if (availableIndex >= 0) {
            this.availableWorkers.splice(availableIndex, 1);
        }
    }

    _addToQueue(task) {
        // Insert task in priority order (higher priority first)
        let insertIndex = this.taskQueue.length;
        for (let i = 0; i < this.taskQueue.length; i++) {
            if (this.taskQueue[i].priority < task.priority) {
                insertIndex = i;
                break;
            }
        }
        
        this.taskQueue.splice(insertIndex, 0, task);
    }

    _processQueue() {
        while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
            const task = this.taskQueue.shift();
            const workerInfo = this.availableWorkers.shift();

            this._executeTask(task, workerInfo);
        }
    }

    _executeTask(task, workerInfo) {
        try {
            workerInfo.busy = true;
            task.started = Date.now();
            task.workerId = workerInfo.id;

            // Set up task timeout
            task.timeout = setTimeout(() => {
                this.stats.tasksTimedOut++;
                this.activeTasks.delete(task.id);
                
                // Reset worker state
                workerInfo.busy = false;
                this.availableWorkers.push(workerInfo);
                
                task.reject(new Error(`Task timeout after ${this.options.taskTimeout}ms`));
                this.emit('task-timeout', { taskId: task.id });
                
                this._processQueue();
            }, this.options.taskTimeout);

            // Add to active tasks
            this.activeTasks.set(task.id, task);

            // Send task to worker
            workerInfo.worker.postMessage({
                taskId: task.id,
                type: task.type,
                data: task.data
            });

            this.emit('task-started', { 
                taskId: task.id, 
                workerId: workerInfo.id,
                waitTime: Date.now() - task.created
            });

        } catch (error) {
            // Reset worker state on error
            workerInfo.busy = false;
            this.availableWorkers.push(workerInfo);
            
            this.stats.tasksFailed++;
            task.reject(error);
            this.emit('task-execution-failed', { taskId: task.id, error: error.message });
        }
    }

    _startAutoScaling() {
        this.scalingTimer = setInterval(() => {
            this._evaluateScaling();
        }, this.options.scalingInterval);
    }

    _evaluateScaling() {
        const now = Date.now();
        if (now - this.lastScalingAction < this.options.scalingInterval * 2) {
            return; // Still in cooldown
        }

        const utilization = this._getUtilization();

        if (utilization > this.options.scaleUpThreshold && this.workers.size < this.options.maxWorkers) {
            const targetSize = Math.min(
                this.workers.size + Math.ceil(this.workers.size * 0.5),
                this.options.maxWorkers
            );
            this.scaleWorkers(targetSize);
            
        } else if (utilization < this.options.scaleDownThreshold && this.workers.size > this.options.minWorkers) {
            const targetSize = Math.max(
                this.workers.size - Math.ceil(this.workers.size * 0.25),
                this.options.minWorkers
            );
            this.scaleWorkers(targetSize);
        }
    }

    async _addWorkers(count) {
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(this._createWorker());
        }
        
        await Promise.all(promises);
    }

    async _removeWorkers(count) {
        const toRemove = this.availableWorkers
            .sort((a, b) => a.lastUsed - b.lastUsed)
            .slice(0, count);

        const promises = toRemove.map(worker => this._terminateWorker(worker));
        await Promise.all(promises);
    }

    _getUtilization() {
        if (this.workers.size === 0) return 0;
        return (this.workers.size - this.availableWorkers.length) / this.workers.size;
    }

    _getEfficiency() {
        const totalTasks = this.stats.tasksCompleted + this.stats.tasksFailed;
        if (totalTasks === 0) return 1;
        return this.stats.tasksCompleted / totalTasks;
    }
}

module.exports = { WorkerThreadPool };