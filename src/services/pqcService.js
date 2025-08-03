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
const ffi = require('ffi-napi');
const ref = require('ref-napi');
const path = require('path');

// C library bindings for PQC operations
const libpqc = ffi.Library(path.join(__dirname, '../lib/libpqc.so'), {
  'kyber_keypair': ['int', ['pointer', 'pointer']],
  'kyber_encapsulate': ['int', ['pointer', 'pointer', 'pointer']],
  'kyber_decapsulate': ['int', ['pointer', 'pointer', 'pointer']],
  'dilithium_keypair': ['int', ['pointer', 'pointer']],
  'dilithium_sign': ['int', ['pointer', 'pointer', 'pointer', 'int', 'pointer']],
  'dilithium_verify': ['int', ['pointer', 'int', 'pointer', 'int', 'pointer']],
  'falcon_keypair': ['int', ['pointer', 'pointer']],
  'falcon_sign': ['int', ['pointer', 'pointer', 'pointer', 'int', 'pointer']],
  'falcon_verify': ['int', ['pointer', 'int', 'pointer', 'int', 'pointer']]
});

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

class PQCService {
  constructor() {
    this.metrics = {
      operationsCount: new Map(),
      averageLatency: new Map(),
      errorCount: new Map()
    };
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
      
      const result = libpqc.kyber_keypair(publicKey, secretKey);
      
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
      
      const result = libpqc.kyber_encapsulate(ciphertext, sharedSecret, publicKey);
      
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
      
      const result = libpqc.kyber_decapsulate(sharedSecret, ciphertext, secretKey);
      
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
      
      const result = libpqc.dilithium_keypair(publicKey, secretKey);
      
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
      const sigLength = ref.alloc('size_t', CONSTANTS.DILITHIUM.SIGNATURE_BYTES);
      
      const result = libpqc.dilithium_sign(signature, sigLength, message, message.length, secretKey);
      
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
      
      const result = libpqc.falcon_keypair(publicKey, secretKey);
      
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
      const sigLength = ref.alloc('size_t', CONSTANTS.FALCON.SIGNATURE_BYTES);
      
      const result = libpqc.falcon_sign(signature, sigLength, message, message.length, secretKey);
      
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
}

module.exports = PQCService;
