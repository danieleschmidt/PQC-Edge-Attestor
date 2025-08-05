/**
 * @file pqcController.js
 * @brief REST API controller for post-quantum cryptography operations
 * 
 * Provides HTTP endpoints for Kyber key encapsulation, Dilithium signatures,
 * and Falcon compact signatures. Handles request validation, rate limiting,
 * and response formatting.
 */

const PQCService = require('../services/pqcService');
const Joi = require('joi');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pqc-controller' },
  transports: [
    new winston.transports.File({ filename: 'logs/pqc-api-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/pqc-api-combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Rate limiting configurations
const keyGenerationLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 15 * 60, // per 15 minutes
});

const cryptoOperationLimiter = new RateLimiterMemory({
  points: 100, // 100 requests
  duration: 60, // per minute
});

// Validation schemas
const schemas = {
  kyberEncapsulate: Joi.object({
    publicKey: Joi.string().base64().required()
      .description('Base64-encoded Kyber public key')
  }),
  
  kyberDecapsulate: Joi.object({
    ciphertext: Joi.string().base64().required()
      .description('Base64-encoded Kyber ciphertext'),
    secretKey: Joi.string().base64().required()
      .description('Base64-encoded Kyber secret key')
  }),
  
  dilithiumSign: Joi.object({
    message: Joi.string().required()
      .description('Message to sign (will be encoded as UTF-8)'),
    secretKey: Joi.string().base64().required()
      .description('Base64-encoded Dilithium secret key'),
    encoding: Joi.string().valid('utf8', 'base64', 'hex').default('utf8')
      .description('Message encoding format')
  }),
  
  dilithiumVerify: Joi.object({
    signature: Joi.string().base64().required()
      .description('Base64-encoded Dilithium signature'),
    message: Joi.string().required()
      .description('Original message'),
    publicKey: Joi.string().base64().required()
      .description('Base64-encoded Dilithium public key'),
    encoding: Joi.string().valid('utf8', 'base64', 'hex').default('utf8')
      .description('Message encoding format')
  }),
  
  falconSign: Joi.object({
    message: Joi.string().required()
      .description('Message to sign (will be encoded as UTF-8)'),
    secretKey: Joi.string().base64().required()
      .description('Base64-encoded Falcon secret key'),
    encoding: Joi.string().valid('utf8', 'base64', 'hex').default('utf8')
      .description('Message encoding format')
  }),
  
  falconVerify: Joi.object({
    signature: Joi.string().base64().required()
      .description('Base64-encoded Falcon signature'),
    message: Joi.string().required()
      .description('Original message'),
    publicKey: Joi.string().base64().required()
      .description('Base64-encoded Falcon public key'),
    encoding: Joi.string().valid('utf8', 'base64', 'hex').default('utf8')
      .description('Message encoding format')
  }),
  
  hybridKeyGen: Joi.object({
    algorithm: Joi.string().valid('kyber', 'dilithium', 'falcon').required()
      .description('Post-quantum algorithm for hybrid key pair')
  })
};

class PQCController {
  constructor() {
    this.pqcService = new PQCService();
  }

  /**
   * Generate Kyber-1024 key pair
   */
  async generateKyberKeyPair(req, res) {
    try {
      logger.info('Kyber key pair generation requested', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      const keyPair = await this.pqcService.generateKyberKeyPair();
      
      res.status(200).json({
        success: true,
        data: {
          publicKey: keyPair.publicKey.toString('base64'),
          secretKey: keyPair.secretKey.toString('base64'),
          algorithm: keyPair.algorithm,
          securityLevel: keyPair.securityLevel,
          keySize: {
            publicKeyBytes: keyPair.publicKey.length,
            secretKeyBytes: keyPair.secretKey.length
          }
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Kyber key generation failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Key generation failed',
          code: 'KYBER_KEYGEN_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Perform Kyber encapsulation
   */
  async kyberEncapsulate(req, res) {
    try {
      const { error, value } = schemas.kyberEncapsulate.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      const publicKey = Buffer.from(value.publicKey, 'base64');
      
      logger.info('Kyber encapsulation requested', {
        publicKeySize: publicKey.length,
        clientIP: req.ip
      });
      
      const result = await this.pqcService.kyberEncapsulate(publicKey);
      
      res.status(200).json({
        success: true,
        data: {
          ciphertext: result.ciphertext.toString('base64'),
          sharedSecret: result.sharedSecret.toString('base64'),
          sizes: {
            ciphertextBytes: result.ciphertext.length,
            sharedSecretBytes: result.sharedSecret.length
          }
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Kyber encapsulation failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Encapsulation failed',
          code: 'KYBER_ENCAPS_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Perform Kyber decapsulation
   */
  async kyberDecapsulate(req, res) {
    try {
      const { error, value } = schemas.kyberDecapsulate.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      const ciphertext = Buffer.from(value.ciphertext, 'base64');
      const secretKey = Buffer.from(value.secretKey, 'base64');
      
      logger.info('Kyber decapsulation requested', {
        ciphertextSize: ciphertext.length,
        clientIP: req.ip
      });
      
      const result = await this.pqcService.kyberDecapsulate(ciphertext, secretKey);
      
      res.status(200).json({
        success: true,
        data: {
          sharedSecret: result.sharedSecret.toString('base64'),
          sharedSecretBytes: result.sharedSecret.length
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Kyber decapsulation failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Decapsulation failed',
          code: 'KYBER_DECAPS_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Generate Dilithium-5 key pair
   */
  async generateDilithiumKeyPair(req, res) {
    try {
      logger.info('Dilithium key pair generation requested', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      const keyPair = await this.pqcService.generateDilithiumKeyPair();
      
      res.status(200).json({
        success: true,
        data: {
          publicKey: keyPair.publicKey.toString('base64'),
          secretKey: keyPair.secretKey.toString('base64'),
          algorithm: keyPair.algorithm,
          securityLevel: keyPair.securityLevel,
          keySize: {
            publicKeyBytes: keyPair.publicKey.length,
            secretKeyBytes: keyPair.secretKey.length
          }
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Dilithium key generation failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Key generation failed',
          code: 'DILITHIUM_KEYGEN_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Create Dilithium digital signature
   */
  async dilithiumSign(req, res) {
    try {
      const { error, value } = schemas.dilithiumSign.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Convert message based on encoding
      let messageBuffer;
      switch (value.encoding) {
        case 'utf8':
          messageBuffer = Buffer.from(value.message, 'utf8');
          break;
        case 'base64':
          messageBuffer = Buffer.from(value.message, 'base64');
          break;
        case 'hex':
          messageBuffer = Buffer.from(value.message, 'hex');
          break;
      }
      
      const secretKey = Buffer.from(value.secretKey, 'base64');
      
      logger.info('Dilithium signing requested', {
        messageSize: messageBuffer.length,
        encoding: value.encoding,
        clientIP: req.ip
      });
      
      const result = await this.pqcService.dilithiumSign(messageBuffer, secretKey);
      
      res.status(200).json({
        success: true,
        data: {
          signature: result.signature.toString('base64'),
          algorithm: result.algorithm,
          messageHash: require('crypto').createHash('sha256').update(messageBuffer).digest('hex'),
          signatureBytes: result.signature.length
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Dilithium signing failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Signing failed',
          code: 'DILITHIUM_SIGN_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Verify Dilithium digital signature
   */
  async dilithiumVerify(req, res) {
    try {
      const { error, value } = schemas.dilithiumVerify.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Convert message based on encoding
      let messageBuffer;
      switch (value.encoding) {
        case 'utf8':
          messageBuffer = Buffer.from(value.message, 'utf8');
          break;
        case 'base64':
          messageBuffer = Buffer.from(value.message, 'base64');
          break;
        case 'hex':
          messageBuffer = Buffer.from(value.message, 'hex');
          break;
      }
      
      const signature = Buffer.from(value.signature, 'base64');
      const publicKey = Buffer.from(value.publicKey, 'base64');
      
      logger.info('Dilithium verification requested', {
        messageSize: messageBuffer.length,
        signatureSize: signature.length,
        encoding: value.encoding,
        clientIP: req.ip
      });
      
      const result = await this.pqcService.dilithiumVerify(signature, messageBuffer, publicKey);
      
      res.status(200).json({
        success: true,
        data: {
          valid: result.valid,
          messageHash: require('crypto').createHash('sha256').update(messageBuffer).digest('hex'),
          algorithm: 'dilithium-5'
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Dilithium verification failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Verification failed',
          code: 'DILITHIUM_VERIFY_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Generate Falcon-1024 key pair
   */
  async generateFalconKeyPair(req, res) {
    try {
      logger.info('Falcon key pair generation requested', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      const keyPair = await this.pqcService.generateFalconKeyPair();
      
      res.status(200).json({
        success: true,
        data: {
          publicKey: keyPair.publicKey.toString('base64'),
          secretKey: keyPair.secretKey.toString('base64'),
          algorithm: keyPair.algorithm,
          securityLevel: keyPair.securityLevel,
          keySize: {
            publicKeyBytes: keyPair.publicKey.length,
            secretKeyBytes: keyPair.secretKey.length
          }
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Falcon key generation failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Key generation failed',
          code: 'FALCON_KEYGEN_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Create Falcon compact digital signature
   */
  async falconSign(req, res) {
    try {
      const { error, value } = schemas.falconSign.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Convert message based on encoding
      let messageBuffer;
      switch (value.encoding) {
        case 'utf8':
          messageBuffer = Buffer.from(value.message, 'utf8');
          break;
        case 'base64':
          messageBuffer = Buffer.from(value.message, 'base64');
          break;
        case 'hex':
          messageBuffer = Buffer.from(value.message, 'hex');
          break;
      }
      
      const secretKey = Buffer.from(value.secretKey, 'base64');
      
      logger.info('Falcon signing requested', {
        messageSize: messageBuffer.length,
        encoding: value.encoding,
        clientIP: req.ip
      });
      
      const result = await this.pqcService.falconSign(messageBuffer, secretKey);
      
      res.status(200).json({
        success: true,
        data: {
          signature: result.signature.toString('base64'),
          algorithm: result.algorithm,
          messageHash: require('crypto').createHash('sha256').update(messageBuffer).digest('hex'),
          signatureBytes: result.signature.length
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Falcon signing failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Signing failed',
          code: 'FALCON_SIGN_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Verify Falcon compact digital signature
   */
  async falconVerify(req, res) {
    try {
      const { error, value } = schemas.falconVerify.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Convert message based on encoding
      let messageBuffer;
      switch (value.encoding) {
        case 'utf8':
          messageBuffer = Buffer.from(value.message, 'utf8');
          break;
        case 'base64':
          messageBuffer = Buffer.from(value.message, 'base64');
          break;
        case 'hex':
          messageBuffer = Buffer.from(value.message, 'hex');
          break;
      }
      
      const signature = Buffer.from(value.signature, 'base64');
      const publicKey = Buffer.from(value.publicKey, 'base64');
      
      logger.info('Falcon verification requested', {
        messageSize: messageBuffer.length,
        signatureSize: signature.length,
        encoding: value.encoding,
        clientIP: req.ip
      });
      
      const result = await this.pqcService.falconVerify(signature, messageBuffer, publicKey);
      
      res.status(200).json({
        success: true,
        data: {
          valid: result.valid,
          messageHash: require('crypto').createHash('sha256').update(messageBuffer).digest('hex'),
          algorithm: 'falcon-1024'
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Falcon verification failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Verification failed',
          code: 'FALCON_VERIFY_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Generate hybrid classical + post-quantum key pair
   */
  async generateHybridKeyPair(req, res) {
    try {
      const { error, value } = schemas.hybridKeyGen.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      logger.info('Hybrid key pair generation requested', {
        algorithm: value.algorithm,
        clientIP: req.ip
      });
      
      const keyPair = await this.pqcService.generateHybridKeyPair(value.algorithm);
      
      res.status(200).json({
        success: true,
        data: {
          classical: {
            publicKey: keyPair.classical.publicKey.toString('base64'),
            privateKey: keyPair.classical.privateKey.toString('base64'),
            algorithm: keyPair.classical.algorithm
          },
          postQuantum: {
            publicKey: keyPair.postQuantum.publicKey.toString('base64'),
            secretKey: keyPair.postQuantum.secretKey.toString('base64'),
            algorithm: keyPair.postQuantum.algorithm,
            securityLevel: keyPair.postQuantum.securityLevel
          },
          hybrid: keyPair.hybrid
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Hybrid key generation failed', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Hybrid key generation failed',
          code: 'HYBRID_KEYGEN_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get PQC service metrics
   */
  async getMetrics(req, res) {
    try {
      const metrics = this.pqcService.getMetrics();
      
      res.status(200).json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to get metrics', {
        error: error.message,
        clientIP: req.ip
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve metrics',
          code: 'METRICS_ERROR'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      // Perform basic health checks
      const health = {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          pqc: 'operational',
          memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal
          }
        }
      };
      
      res.status(200).json({
        success: true,
        data: health
      });
      
    } catch (error) {
      res.status(503).json({
        success: false,
        error: {
          message: 'Service unhealthy',
          code: 'HEALTH_CHECK_FAILED'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  // Middleware functions
  static getKeyGenerationLimiter() {
    return async (req, res, next) => {
      try {
        await keyGenerationLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({
          success: false,
          error: {
            message: 'Too many key generation requests, please try again later',
            code: 'RATE_LIMIT_EXCEEDED'
          },
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  static getCryptoOperationLimiter() {
    return async (req, res, next) => {
      try {
        await cryptoOperationLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({
          success: false,
          error: {
            message: 'Too many cryptographic operations, please try again later',
            code: 'RATE_LIMIT_EXCEEDED'
          },
          timestamp: new Date().toISOString()
        });
      }
    };
  }
}

module.exports = PQCController;
