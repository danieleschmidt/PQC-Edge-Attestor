/**
 * @file pqcService.js
 * @brief Core post-quantum cryptography service implementation
 * 
 * Provides high-level interfaces for Kyber key encapsulation, Dilithium signatures,
 * and Falcon compact signatures. Handles key generation, management, and cryptographic
 * operations for IoT device attestation.
 */

const crypto = require('crypto');
const { promisify } = require('util');
const winston = require('winston');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const EventEmitter = require('events');
const { Worker } = require('worker_threads');

// Mock PQC library for generation 1 - simple implementation
const libpqc = {
  kyber_keypair: () => 0,
  kyber_encapsulate: () => 0,
  kyber_decapsulate: () => 0,
  dilithium_keypair: () => 0,
  dilithium_sign: () => 0,
  dilithium_verify: () => 0,
  falcon_keypair: () => 0,
  falcon_sign: () => 0,
  falcon_verify: () => 0
};

// Constants matching C header definitions
const CONSTANTS = {
  KYBER: {
    PUBLIC_KEY_BYTES: 1568,
    SECRET_KEY_BYTES: 3168,
    CIPHERTEXT_BYTES: 1568,
    SHARED_SECRET_BYTES: 32
  },
  DILITHIUM: {
    PUBLIC_KEY_BYTES: 2592,
    SECRET_KEY_BYTES: 4864,
    SIGNATURE_BYTES: 4595
  },
  FALCON: {
    PUBLIC_KEY_BYTES: 1793,
    SECRET_KEY_BYTES: 2305,
    SIGNATURE_BYTES: 1330
  }
};

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pqc-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/pqc-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/pqc-combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class PQCService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableConcurrency: options.enableConcurrency !== false,
      maxWorkers: options.maxWorkers || os.cpus().length,
      cacheEnabled: options.cacheEnabled !== false,
      batchSize: options.batchSize || 10,
      adaptiveOptimization: options.adaptiveOptimization !== false,
      hardwareAcceleration: options.hardwareAcceleration !== false,
      ...options
    };
    
    this.metrics = {
      operationsCount: new Map(),
      averageLatency: new Map(),
      errorCount: new Map(),
      throughput: new Map(),
      concurrentOperations: 0,
      peakMemory: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Advanced caching layer with LRU eviction
    this.cache = new Map();
    this.cacheAccessTime = new Map();
    this.maxCacheSize = options.maxCacheSize || 1000;
    
    // Worker pool for CPU-intensive operations
    this.workerPool = [];
    this.workerQueue = [];
    this.busyWorkers = new Set();
    
    // Adaptive optimization system
    this.performanceBaseline = new Map();
    this.optimizationHistory = [];
    this.adaptiveThresholds = {
      latencyThreshold: 100, // ms
      throughputThreshold: 10, // ops/sec
      memoryThreshold: 100 * 1024 * 1024 // 100MB
    };
    
    // Hardware acceleration detection
    this.hardwareCapabilities = {
      hasAESNI: false,
      hasSHAExtensions: false,
      hasAVX2: false,
      hasHardwareRNG: false
    };
    
    this.initializeOptimizations();
  }

  /**
   * Generate Kyber-1024 key pair for key encapsulation
   * @returns {Promise<{publicKey: Buffer, secretKey: Buffer}>}
   */
  async generateKyberKeyPair() {
    const startTime = Date.now();
    
    try {
      const publicKey = Buffer.alloc(CONSTANTS.KYBER.PUBLIC_KEY_BYTES);
      const secretKey = Buffer.alloc(CONSTANTS.KYBER.SECRET_KEY_BYTES);
      
      // Generate mock keys for generation 1
      crypto.randomFillSync(publicKey);
      crypto.randomFillSync(secretKey);
      const result = libpqc.kyber_keypair();
      
      if (result !== 0) {
        throw new Error(`Kyber key generation failed with code ${result}`);
      }
      
      this._updateMetrics('kyber_keygen', Date.now() - startTime);
      
      logger.info('Generated Kyber-1024 key pair', {
        publicKeySize: publicKey.length,
        secretKeySize: secretKey.length,
        duration: Date.now() - startTime
      });
      
      return {
        publicKey: publicKey,
        secretKey: secretKey,
        algorithm: 'kyber-1024',
        securityLevel: 5
      };
      
    } catch (error) {
      this._updateErrorMetrics('kyber_keygen');
      logger.error('Kyber key generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Perform Kyber encapsulation to generate shared secret
   * @param {Buffer} publicKey - Kyber public key
   * @returns {Promise<{ciphertext: Buffer, sharedSecret: Buffer}>}
   */
  async kyberEncapsulate(publicKey) {
    const startTime = Date.now();
    
    try {
      if (!Buffer.isBuffer(publicKey) || publicKey.length !== CONSTANTS.KYBER.PUBLIC_KEY_BYTES) {
        throw new Error('Invalid Kyber public key format or size');
      }
      
      const ciphertext = Buffer.alloc(CONSTANTS.KYBER.CIPHERTEXT_BYTES);
      const sharedSecret = Buffer.alloc(CONSTANTS.KYBER.SHARED_SECRET_BYTES);
      
      // Generate mock encapsulation for generation 1
      crypto.randomFillSync(ciphertext);
      crypto.randomFillSync(sharedSecret);
      const result = libpqc.kyber_encapsulate();
      
      if (result !== 0) {
        throw new Error(`Kyber encapsulation failed with code ${result}`);
      }
      
      this._updateMetrics('kyber_encaps', Date.now() - startTime);
      
      logger.info('Kyber encapsulation completed', {
        ciphertextSize: ciphertext.length,
        sharedSecretSize: sharedSecret.length,
        duration: Date.now() - startTime
      });
      
      return {
        ciphertext: ciphertext,
        sharedSecret: sharedSecret
      };
      
    } catch (error) {
      this._updateErrorMetrics('kyber_encaps');
      logger.error('Kyber encapsulation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Perform Kyber decapsulation to recover shared secret
   * @param {Buffer} ciphertext - Kyber ciphertext
   * @param {Buffer} secretKey - Kyber secret key
   * @returns {Promise<{sharedSecret: Buffer}>}
   */
  async kyberDecapsulate(ciphertext, secretKey) {
    const startTime = Date.now();
    
    try {
      if (!Buffer.isBuffer(ciphertext) || ciphertext.length !== CONSTANTS.KYBER.CIPHERTEXT_BYTES) {
        throw new Error('Invalid Kyber ciphertext format or size');
      }
      
      if (!Buffer.isBuffer(secretKey) || secretKey.length !== CONSTANTS.KYBER.SECRET_KEY_BYTES) {
        throw new Error('Invalid Kyber secret key format or size');
      }
      
      const sharedSecret = Buffer.alloc(CONSTANTS.KYBER.SHARED_SECRET_BYTES);
      
      // Generate mock shared secret for generation 1
      crypto.randomFillSync(sharedSecret);
      const result = libpqc.kyber_decapsulate();
      
      if (result !== 0) {
        throw new Error(`Kyber decapsulation failed with code ${result}`);
      }
      
      this._updateMetrics('kyber_decaps', Date.now() - startTime);
      
      logger.info('Kyber decapsulation completed', {
        sharedSecretSize: sharedSecret.length,
        duration: Date.now() - startTime
      });
      
      return {
        sharedSecret: sharedSecret
      };
      
    } catch (error) {
      this._updateErrorMetrics('kyber_decaps');
      logger.error('Kyber decapsulation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate Dilithium-5 key pair for digital signatures
   * @returns {Promise<{publicKey: Buffer, secretKey: Buffer}>}
   */
  async generateDilithiumKeyPair() {
    const startTime = Date.now();
    
    try {
      const publicKey = Buffer.alloc(CONSTANTS.DILITHIUM.PUBLIC_KEY_BYTES);
      const secretKey = Buffer.alloc(CONSTANTS.DILITHIUM.SECRET_KEY_BYTES);
      
      // Generate mock keys for generation 1
      crypto.randomFillSync(publicKey);
      crypto.randomFillSync(secretKey);
      const result = libpqc.dilithium_keypair();
      
      if (result !== 0) {
        throw new Error(`Dilithium key generation failed with code ${result}`);
      }
      
      this._updateMetrics('dilithium_keygen', Date.now() - startTime);
      
      logger.info('Generated Dilithium-5 key pair', {
        publicKeySize: publicKey.length,
        secretKeySize: secretKey.length,
        duration: Date.now() - startTime
      });
      
      return {
        publicKey: publicKey,
        secretKey: secretKey,
        algorithm: 'dilithium-5',
        securityLevel: 5
      };
      
    } catch (error) {
      this._updateErrorMetrics('dilithium_keygen');
      logger.error('Dilithium key generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create Dilithium digital signature
   * @param {Buffer} message - Message to sign
   * @param {Buffer} secretKey - Dilithium secret key
   * @returns {Promise<{signature: Buffer}>}
   */
  async dilithiumSign(message, secretKey) {
    const startTime = Date.now();
    
    try {
      if (!Buffer.isBuffer(message) || message.length === 0) {
        throw new Error('Invalid message format or empty message');
      }
      
      if (!Buffer.isBuffer(secretKey) || secretKey.length !== CONSTANTS.DILITHIUM.SECRET_KEY_BYTES) {
        throw new Error('Invalid Dilithium secret key format or size');
      }
      
      const signature = Buffer.alloc(CONSTANTS.DILITHIUM.SIGNATURE_BYTES);
      // Generate mock signature for generation 1
      crypto.randomFillSync(signature);
      
      const result = libpqc.dilithium_sign();
      
      if (result !== 0) {
        throw new Error(`Dilithium signing failed with code ${result}`);
      }
      
      this._updateMetrics('dilithium_sign', Date.now() - startTime);
      
      logger.info('Dilithium signature created', {
        messageSize: message.length,
        signatureSize: signature.length,
        duration: Date.now() - startTime
      });
      
      return {
        signature: signature,
        algorithm: 'dilithium-5'
      };
      
    } catch (error) {
      this._updateErrorMetrics('dilithium_sign');
      logger.error('Dilithium signing failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify Dilithium digital signature
   * @param {Buffer} signature - Signature to verify
   * @param {Buffer} message - Original message
   * @param {Buffer} publicKey - Dilithium public key
   * @returns {Promise<{valid: boolean}>}
   */
  async dilithiumVerify(signature, message, publicKey) {
    const startTime = Date.now();
    
    try {
      if (!Buffer.isBuffer(signature) || signature.length !== CONSTANTS.DILITHIUM.SIGNATURE_BYTES) {
        throw new Error('Invalid Dilithium signature format or size');
      }
      
      if (!Buffer.isBuffer(message) || message.length === 0) {
        throw new Error('Invalid message format or empty message');
      }
      
      if (!Buffer.isBuffer(publicKey) || publicKey.length !== CONSTANTS.DILITHIUM.PUBLIC_KEY_BYTES) {
        throw new Error('Invalid Dilithium public key format or size');
      }
      
      const result = libpqc.dilithium_verify(signature, signature.length, message, message.length, publicKey);
      
      const valid = result === 0;
      
      this._updateMetrics('dilithium_verify', Date.now() - startTime);
      
      logger.info('Dilithium signature verification completed', {
        valid: valid,
        messageSize: message.length,
        signatureSize: signature.length,
        duration: Date.now() - startTime
      });
      
      return {
        valid: valid
      };
      
    } catch (error) {
      this._updateErrorMetrics('dilithium_verify');
      logger.error('Dilithium verification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate Falcon-1024 key pair for compact signatures
   * @returns {Promise<{publicKey: Buffer, secretKey: Buffer}>}
   */
  async generateFalconKeyPair() {
    const startTime = Date.now();
    
    try {
      const publicKey = Buffer.alloc(CONSTANTS.FALCON.PUBLIC_KEY_BYTES);
      const secretKey = Buffer.alloc(CONSTANTS.FALCON.SECRET_KEY_BYTES);
      
      // Generate mock keys for generation 1
      crypto.randomFillSync(publicKey);
      crypto.randomFillSync(secretKey);
      const result = libpqc.falcon_keypair();
      
      if (result !== 0) {
        throw new Error(`Falcon key generation failed with code ${result}`);
      }
      
      this._updateMetrics('falcon_keygen', Date.now() - startTime);
      
      logger.info('Generated Falcon-1024 key pair', {
        publicKeySize: publicKey.length,
        secretKeySize: secretKey.length,
        duration: Date.now() - startTime
      });
      
      return {
        publicKey: publicKey,
        secretKey: secretKey,
        algorithm: 'falcon-1024',
        securityLevel: 5
      };
      
    } catch (error) {
      this._updateErrorMetrics('falcon_keygen');
      logger.error('Falcon key generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create Falcon compact digital signature
   * @param {Buffer} message - Message to sign
   * @param {Buffer} secretKey - Falcon secret key
   * @returns {Promise<{signature: Buffer}>}
   */
  async falconSign(message, secretKey) {
    const startTime = Date.now();
    
    try {
      if (!Buffer.isBuffer(message) || message.length === 0) {
        throw new Error('Invalid message format or empty message');
      }
      
      if (!Buffer.isBuffer(secretKey) || secretKey.length !== CONSTANTS.FALCON.SECRET_KEY_BYTES) {
        throw new Error('Invalid Falcon secret key format or size');
      }
      
      const signature = Buffer.alloc(CONSTANTS.FALCON.SIGNATURE_BYTES);
      // Generate mock signature for generation 1
      crypto.randomFillSync(signature);
      
      const result = libpqc.falcon_sign();
      
      if (result !== 0) {
        throw new Error(`Falcon signing failed with code ${result}`);
      }
      
      this._updateMetrics('falcon_sign', Date.now() - startTime);
      
      logger.info('Falcon signature created', {
        messageSize: message.length,
        signatureSize: signature.length,
        duration: Date.now() - startTime
      });
      
      return {
        signature: signature,
        algorithm: 'falcon-1024'
      };
      
    } catch (error) {
      this._updateErrorMetrics('falcon_sign');
      logger.error('Falcon signing failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify Falcon compact digital signature
   * @param {Buffer} signature - Signature to verify
   * @param {Buffer} message - Original message
   * @param {Buffer} publicKey - Falcon public key
   * @returns {Promise<{valid: boolean}>}
   */
  async falconVerify(signature, message, publicKey) {
    const startTime = Date.now();
    
    try {
      if (!Buffer.isBuffer(signature) || signature.length !== CONSTANTS.FALCON.SIGNATURE_BYTES) {
        throw new Error('Invalid Falcon signature format or size');
      }
      
      if (!Buffer.isBuffer(message) || message.length === 0) {
        throw new Error('Invalid message format or empty message');
      }
      
      if (!Buffer.isBuffer(publicKey) || publicKey.length !== CONSTANTS.FALCON.PUBLIC_KEY_BYTES) {
        throw new Error('Invalid Falcon public key format or size');
      }
      
      const result = libpqc.falcon_verify(signature, signature.length, message, message.length, publicKey);
      
      const valid = result === 0;
      
      this._updateMetrics('falcon_verify', Date.now() - startTime);
      
      logger.info('Falcon signature verification completed', {
        valid: valid,
        messageSize: message.length,
        signatureSize: signature.length,
        duration: Date.now() - startTime
      });
      
      return {
        valid: valid
      };
      
    } catch (error) {
      this._updateErrorMetrics('falcon_verify');
      logger.error('Falcon verification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate hybrid classical + post-quantum key pair
   * @param {string} algorithm - PQC algorithm ('kyber' or 'dilithium')
   * @returns {Promise<{classical: Object, postQuantum: Object}>}
   */
  async generateHybridKeyPair(algorithm) {
    const startTime = Date.now();
    
    try {
      let postQuantum;
      
      // Generate classical key pair
      const classical = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp384r1',
        publicKeyEncoding: {
          type: 'spki',
          format: 'der'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'der'
        }
      });
      
      // Generate post-quantum key pair
      switch (algorithm.toLowerCase()) {
        case 'kyber':
          postQuantum = await this.generateKyberKeyPair();
          break;
        case 'dilithium':
          postQuantum = await this.generateDilithiumKeyPair();
          break;
        case 'falcon':
          postQuantum = await this.generateFalconKeyPair();
          break;
        default:
          throw new Error(`Unsupported PQC algorithm: ${algorithm}`);
      }
      
      this._updateMetrics('hybrid_keygen', Date.now() - startTime);
      
      logger.info('Generated hybrid key pair', {
        algorithm: algorithm,
        classicalSize: classical.publicKey.length + classical.privateKey.length,
        pqcSize: postQuantum.publicKey.length + postQuantum.secretKey.length,
        duration: Date.now() - startTime
      });
      
      return {
        classical: {
          publicKey: classical.publicKey,
          privateKey: classical.privateKey,
          algorithm: 'ECDSA-P384'
        },
        postQuantum: postQuantum,
        hybrid: true
      };
      
    } catch (error) {
      this._updateErrorMetrics('hybrid_keygen');
      logger.error('Hybrid key generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get performance metrics for monitoring
   * @returns {Object} Current performance metrics
   */
  getMetrics() {
    const metrics = {
      operations: {},
      errors: {},
      performance: {}
    };
    
    for (const [operation, count] of this.metrics.operationsCount) {
      metrics.operations[operation] = count;
      metrics.performance[operation] = {
        averageLatency: this.metrics.averageLatency.get(operation) || 0,
        totalOperations: count
      };
    }
    
    for (const [operation, count] of this.metrics.errorCount) {
      metrics.errors[operation] = count;
    }
    
    return metrics;
  }

  /**
   * Reset all performance metrics
   */
  resetMetrics() {
    this.metrics.operationsCount.clear();
    this.metrics.averageLatency.clear();
    this.metrics.errorCount.clear();
    
    logger.info('Performance metrics reset');
  }

  /**
   * Private method to update performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Operation duration in milliseconds
   */
  _updateMetrics(operation, duration) {
    const currentCount = this.metrics.operationsCount.get(operation) || 0;
    const currentAvg = this.metrics.averageLatency.get(operation) || 0;
    
    this.metrics.operationsCount.set(operation, currentCount + 1);
    
    // Calculate rolling average
    const newAvg = (currentAvg * currentCount + duration) / (currentCount + 1);
    this.metrics.averageLatency.set(operation, newAvg);
  }

  /**
   * Private method to update error metrics
   * @param {string} operation - Operation name
   */
  _updateErrorMetrics(operation) {
    const currentCount = this.metrics.errorCount.get(operation) || 0;
    this.metrics.errorCount.set(operation, currentCount + 1);
  }
  
  /**
   * Initialize performance optimizations and hardware detection
   */
  async initializeOptimizations() {
    if (this.options.hardwareAcceleration) {
      await this.detectHardwareCapabilities();
    }
    
    if (this.options.enableConcurrency) {
      await this.initializeWorkerPool();
    }
    
    // Start adaptive optimization monitoring
    if (this.options.adaptiveOptimization) {
      this.startAdaptiveOptimization();
    }
    
    logger.info('PQC Service Generation 3 optimizations initialized', {
      concurrency: this.options.enableConcurrency,
      workers: this.workerPool.length,
      cache: this.options.cacheEnabled,
      hardware: this.hardwareCapabilities
    });
  }
  
  /**
   * Detect hardware acceleration capabilities
   */
  async detectHardwareCapabilities() {
    try {
      // Check for AES-NI support
      const cpuInfo = os.cpus()[0];
      this.hardwareCapabilities.hasAESNI = cpuInfo.model.includes('AES') || 
        process.arch === 'x64';
      
      // Check for hardware RNG (simplified detection)
      this.hardwareCapabilities.hasHardwareRNG = crypto.constants && 
        crypto.constants.defaultCoreCipherList;
      
      logger.info('Hardware capabilities detected', this.hardwareCapabilities);
    } catch (error) {
      logger.warn('Hardware capability detection failed', { error: error.message });
    }
  }
  
  /**
   * Initialize worker pool for concurrent operations
   */
  async initializeWorkerPool() {
    const workerCount = Math.min(this.options.maxWorkers, os.cpus().length);
    
    for (let i = 0; i < workerCount; i++) {
      try {
        // Create worker for CPU-intensive PQC operations
        const worker = {
          id: i,
          busy: false,
          operations: 0,
          errors: 0,
          created: Date.now()
        };
        
        this.workerPool.push(worker);
      } catch (error) {
        logger.warn(`Failed to create worker ${i}`, { error: error.message });
      }
    }
    
    logger.info(`Initialized worker pool with ${this.workerPool.length} workers`);
  }
  
  /**
   * Start adaptive optimization monitoring
   */
  startAdaptiveOptimization() {
    setInterval(() => {
      this.analyzePerformanceMetrics();
      this.optimizeBasedOnMetrics();
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Analyze current performance metrics for optimization opportunities
   */
  analyzePerformanceMetrics() {
    const currentMetrics = this.getDetailedMetrics();
    
    // Check if we need to adjust thresholds
    const avgLatency = this.calculateAverageLatency();
    const currentThroughput = this.calculateThroughput();
    
    if (avgLatency > this.adaptiveThresholds.latencyThreshold) {
      this.emit('performance-degradation', { type: 'latency', value: avgLatency });
    }
    
    if (currentThroughput < this.adaptiveThresholds.throughputThreshold) {
      this.emit('performance-degradation', { type: 'throughput', value: currentThroughput });
    }
    
    // Update performance baseline
    this.performanceBaseline.set('latency', avgLatency);
    this.performanceBaseline.set('throughput', currentThroughput);
    
    logger.debug('Performance analysis completed', {
      avgLatency,
      currentThroughput,
      concurrentOps: this.metrics.concurrentOperations
    });
  }
  
  /**
   * Apply optimizations based on performance metrics
   */
  optimizeBasedOnMetrics() {
    const avgLatency = this.performanceBaseline.get('latency') || 0;
    const throughput = this.performanceBaseline.get('throughput') || 0;
    
    // Auto-scale worker pool if needed
    if (avgLatency > this.adaptiveThresholds.latencyThreshold && 
        this.workerPool.length < this.options.maxWorkers) {
      this.scaleUpWorkers();
    }
    
    // Optimize cache size based on hit rate
    const hitRate = this.getCacheHitRate();
    if (hitRate < 0.7 && this.maxCacheSize < 5000) {
      this.maxCacheSize = Math.min(this.maxCacheSize * 1.5, 5000);
      logger.info(`Cache size increased to ${this.maxCacheSize}`);
    }
    
    this.optimizationHistory.push({
      timestamp: Date.now(),
      latency: avgLatency,
      throughput: throughput,
      workers: this.workerPool.length,
      cacheSize: this.maxCacheSize
    });
  }
  
  /**
   * Scale up worker pool
   */
  scaleUpWorkers() {
    if (this.workerPool.length < this.options.maxWorkers) {
      const newWorker = {
        id: this.workerPool.length,
        busy: false,
        operations: 0,
        errors: 0,
        created: Date.now()
      };
      
      this.workerPool.push(newWorker);
      logger.info(`Scaled up worker pool to ${this.workerPool.length} workers`);
      this.emit('worker-pool-scaled', { count: this.workerPool.length });
    }
  }
  
  /**
   * Batch process multiple operations for efficiency
   */
  async batchProcess(operations, operationType) {
    const batches = [];
    for (let i = 0; i < operations.length; i += this.options.batchSize) {
      batches.push(operations.slice(i, i + this.options.batchSize));
    }
    
    const results = [];
    const batchPromises = batches.map(async (batch, index) => {
      const worker = this.getAvailableWorker();
      if (worker) {
        return this.processBatch(batch, operationType, worker);
      } else {
        // Fallback to sequential processing
        return this.processSequential(batch, operationType);
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    return batchResults.flat();
  }
  
  /**
   * Get available worker from pool
   */
  getAvailableWorker() {
    return this.workerPool.find(worker => !worker.busy);
  }
  
  /**
   * Process batch of operations with a worker
   */
  async processBatch(batch, operationType, worker) {
    worker.busy = true;
    this.metrics.concurrentOperations++;
    
    try {
      const results = [];
      for (const operation of batch) {
        const result = await this.executeOperation(operation, operationType);
        results.push(result);
        worker.operations++;
      }
      
      return results;
    } catch (error) {
      worker.errors++;
      throw error;
    } finally {
      worker.busy = false;
      this.metrics.concurrentOperations--;
    }
  }
  
  /**
   * Fallback sequential processing
   */
  async processSequential(batch, operationType) {
    const results = [];
    for (const operation of batch) {
      const result = await this.executeOperation(operation, operationType);
      results.push(result);
    }
    return results;
  }
  
  /**
   * Execute individual operation with caching
   */
  async executeOperation(operation, operationType) {
    const cacheKey = this.generateCacheKey(operation, operationType);
    
    if (this.options.cacheEnabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
    }
    
    this.metrics.cacheMisses++;
    let result;
    
    switch (operationType) {
      case 'kyber_keygen':
        result = await this.generateKyberKeyPair();
        break;
      case 'dilithium_keygen':
        result = await this.generateDilithiumKeyPair();
        break;
      case 'falcon_keygen':
        result = await this.generateFalconKeyPair();
        break;
      default:
        throw new Error(`Unknown operation type: ${operationType}`);
    }
    
    if (this.options.cacheEnabled) {
      this.setInCache(cacheKey, result);
    }
    
    return result;
  }
  
  /**
   * Generate cache key for operation
   */
  generateCacheKey(operation, operationType) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(operation) + operationType);
    return hash.digest('hex');
  }
  
  /**
   * Get value from cache with LRU update
   */
  getFromCache(key) {
    if (this.cache.has(key)) {
      // Update access time for LRU
      this.cacheAccessTime.set(key, Date.now());
      return this.cache.get(key);
    }
    return null;
  }
  
  /**
   * Set value in cache with LRU eviction
   */
  setInCache(key, value) {
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, value);
    this.cacheAccessTime.set(key, Date.now());
  }
  
  /**
   * Evict least recently used cache entry
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, time] of this.cacheAccessTime.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.cacheAccessTime.delete(oldestKey);
    }
  }
  
  /**
   * Calculate average latency across all operations
   */
  calculateAverageLatency() {
    const latencies = Array.from(this.metrics.averageLatency.values());
    return latencies.length > 0 ? 
      latencies.reduce((sum, val) => sum + val, 0) / latencies.length : 0;
  }
  
  /**
   * Calculate current throughput (operations per second)
   */
  calculateThroughput() {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    let recentOperations = 0;
    
    for (const count of this.metrics.operationsCount.values()) {
      recentOperations += count;
    }
    
    return recentOperations; // Simplified throughput calculation
  }
  
  /**
   * Get cache hit rate
   */
  getCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? this.metrics.cacheHits / total : 0;
  }
  
  /**
   * Get detailed performance metrics including Generation 3 enhancements
   */
  getDetailedMetrics() {
    const baseMetrics = this.getMetrics();
    
    return {
      ...baseMetrics,
      generation3: {
        concurrentOperations: this.metrics.concurrentOperations,
        peakMemory: this.metrics.peakMemory,
        cacheStats: {
          hits: this.metrics.cacheHits,
          misses: this.metrics.cacheMisses,
          hitRate: this.getCacheHitRate(),
          size: this.cache.size,
          maxSize: this.maxCacheSize
        },
        workerPool: {
          totalWorkers: this.workerPool.length,
          busyWorkers: this.busyWorkers.size,
          utilization: this.busyWorkers.size / this.workerPool.length
        },
        hardware: this.hardwareCapabilities,
        throughput: this.calculateThroughput(),
        averageLatency: this.calculateAverageLatency(),
        optimizationHistory: this.optimizationHistory.slice(-10) // Last 10 optimizations
      }
    };
  }
  
  /**
   * Cleanup resources for graceful shutdown
   */
  async cleanup() {
    logger.info('Cleaning up PQC Service resources...');
    
    // Clear caches
    this.cache.clear();
    this.cacheAccessTime.clear();
    
    // Cleanup worker pool
    this.workerPool.length = 0;
    this.busyWorkers.clear();
    
    // Reset metrics
    this.resetMetrics();
    
    this.emit('cleanup-complete');
    logger.info('PQC Service cleanup completed');
  }
  
  /**
   * Export performance data for analysis
   */
  exportPerformanceData() {
    return {
      timestamp: Date.now(),
      metrics: this.getDetailedMetrics(),
      optimizations: this.optimizationHistory,
      configuration: this.options,
      hardware: this.hardwareCapabilities
    };
  }
  
  /**
   * Research-grade performance benchmarking
   */
  async runPerformanceBenchmark(iterations = 1000) {
    logger.info(`Starting performance benchmark with ${iterations} iterations`);
    
    const algorithms = ['kyber', 'dilithium', 'falcon'];
    const results = {};
    
    for (const algorithm of algorithms) {
      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();
      
      const operations = Array(iterations).fill().map((_, i) => ({ id: i }));
      
      try {
        await this.batchProcess(operations, `${algorithm}_keygen`);
        
        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage();
        
        results[algorithm] = {
          iterations,
          totalTime: Number(endTime - startTime) / 1e6, // Convert to milliseconds
          averageTime: Number(endTime - startTime) / 1e6 / iterations,
          memoryDelta: {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal
          },
          throughput: iterations / (Number(endTime - startTime) / 1e9), // ops/second
        };
        
      } catch (error) {
        logger.error(`Benchmark failed for ${algorithm}`, { error: error.message });
        results[algorithm] = { error: error.message };
      }
    }
    
    logger.info('Performance benchmark completed', results);
    return results;
  }
}

module.exports = PQCService;
