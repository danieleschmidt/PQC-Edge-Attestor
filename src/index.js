/**
 * @file index.js
 * @brief Main application entry point for PQC-Edge-Attestor
 * 
 * Initializes the Express server with post-quantum cryptography APIs,
 * device management endpoints, and attestation services. Provides
 * comprehensive security middleware and monitoring capabilities.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const winston = require('winston');
const path = require('path');
require('dotenv').config();

// Import routes
const pqcRoutes = require('./routes/pqc');
const attestationRoutes = require('./routes/attestation');
const deviceRoutes = require('./routes/devices');
const healthRoutes = require('./routes/health');

// Import services
const PQCService = require('./services/pqcService');
const AttestationService = require('./services/attestationService');
const DeviceManagementService = require('./services/deviceManagementService');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pqc-edge-attestor' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/combined.log') 
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Application configuration
const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: 'v1',
  maxRequestSize: '10mb',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 1000, // requests per window
  enableSwagger: process.env.ENABLE_SWAGGER === 'true',
  enableMetrics: process.env.ENABLE_METRICS !== 'false'
};

class PQCEdgeAttestorServer {
  constructor() {
    this.app = express();
    this.services = {};
    this.server = null;
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    try {
      logger.info('Initializing services...');
      
      // Initialize core services
      this.services.pqc = new PQCService();
      this.services.attestation = new AttestationService();
      this.services.deviceManagement = new DeviceManagementService();
      
      // Initialize TPM if available
      const tpmInitialized = await this.services.attestation.initializeTPM();
      if (!tpmInitialized) {
        logger.warn('TPM initialization failed - continuing without hardware attestation');
      }
      
      // Setup service event listeners
      this._setupServiceEventListeners();
      
      logger.info('All services initialized successfully');
      
    } catch (error) {
      logger.error('Service initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Configure Express middleware
   */
  configureMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration
    this.app.use(cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
      maxAge: 86400 // 24 hours
    }));
    
    // Compression
    this.app.use(compression());
    
    // Request parsing
    this.app.use(express.json({ limit: config.maxRequestSize }));
    this.app.use(express.urlencoded({ extended: true, limit: config.maxRequestSize }));
    
    // Logging middleware
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));
    
    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = require('crypto').randomUUID();
      res.setHeader('X-Request-ID', req.id);
      next();
    });
    
    // Request timing middleware
    this.app.use((req, res, next) => {
      req.startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        logger.info('Request completed', {
          requestId: req.id,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });
      next();
    });
  }

  /**
   * Configure API routes
   */
  configureRoutes() {
    const apiBase = `/api/${config.apiVersion}`;
    
    // Health check endpoint (no auth required)
    this.app.use('/health', healthRoutes);
    
    // API documentation
    if (config.enableSwagger) {
      this._setupSwaggerDocs();
    }
    
    // Main API routes
    this.app.use(`${apiBase}/pqc`, pqcRoutes);
    this.app.use(`${apiBase}/attestation`, attestationRoutes);
    this.app.use(`${apiBase}/devices`, deviceRoutes);
    
    // Metrics endpoint
    if (config.enableMetrics) {
      this.app.get(`${apiBase}/metrics`, (req, res) => {
        const metrics = {
          pqc: this.services.pqc.getMetrics(),
          attestation: this.services.attestation.getMetrics(),
          deviceManagement: this.services.deviceManagement.getMetrics(),
          system: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            version: process.version,
            platform: process.platform
          }
        };
        
        res.json({
          success: true,
          data: metrics,
          timestamp: new Date().toISOString()
        });
      });
    }
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'PQC-Edge-Attestor',
        version: '1.0.0',
        description: 'Post-quantum cryptographic framework for IoT edge device attestation',
        endpoints: {
          health: '/health',
          api: `${apiBase}`,
          documentation: config.enableSwagger ? '/api-docs' : null,
          metrics: config.enableMetrics ? `${apiBase}/metrics` : null
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          message: 'Endpoint not found',
          code: 'NOT_FOUND',
          path: req.originalUrl
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Configure error handling
   */
  configureErrorHandling() {
    // Error handling middleware
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error', {
        requestId: req.id,
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      // Don't leak error details in production
      const isDevelopment = config.nodeEnv === 'development';
      
      res.status(error.status || 500).json({
        success: false,
        error: {
          message: error.message || 'Internal server error',
          code: error.code || 'INTERNAL_ERROR',
          ...(isDevelopment && { stack: error.stack })
        },
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize services first
      await this.initializeServices();
      
      // Configure Express app
      this.configureMiddleware();
      this.configureRoutes();
      this.configureErrorHandling();
      
      // Start server
      this.server = this.app.listen(config.port, () => {
        logger.info('PQC-Edge-Attestor server started', {
          port: config.port,
          environment: config.nodeEnv,
          apiVersion: config.apiVersion,
          pid: process.pid,
          timestamp: new Date().toISOString()
        });
      });
      
      // Setup graceful shutdown
      this._setupGracefulShutdown();
      
    } catch (error) {
      logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop() {
    return new Promise((resolve) => {
      logger.info('Shutting down server...');
      
      if (this.server) {
        this.server.close((error) => {
          if (error) {
            logger.error('Error during server shutdown', { error: error.message });
          } else {
            logger.info('Server shutdown completed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup service event listeners
   */
  _setupServiceEventListeners() {
    // Device management events
    this.services.deviceManagement.on('deviceProvisioned', (event) => {
      logger.info('Device provisioned', event);
    });
    
    this.services.deviceManagement.on('attestationFailed', (event) => {
      logger.warn('Device attestation failed', event);
    });
    
    this.services.deviceManagement.on('firmwareUpdateCompleted', (event) => {
      logger.info('Firmware update completed', event);
    });
    
    this.services.deviceManagement.on('deviceRevoked', (event) => {
      logger.warn('Device revoked', event);
    });
  }

  /**
   * Setup Swagger API documentation
   */
  _setupSwaggerDocs() {
    try {
      const swaggerJsdoc = require('swagger-jsdoc');
      const swaggerUi = require('swagger-ui-express');
      
      const options = {
        definition: {
          openapi: '3.0.0',
          info: {
            title: 'PQC-Edge-Attestor API',
            version: '1.0.0',
            description: 'Post-quantum cryptographic framework for IoT edge device attestation',
            contact: {
              name: 'Terragon Labs',
              email: 'dev@terragonlabs.com',
              url: 'https://terragonlabs.com'
            },
            license: {
              name: 'Apache 2.0',
              url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
            }
          },
          servers: [
            {
              url: `http://localhost:${config.port}/api/${config.apiVersion}`,
              description: 'Development server'
            }
          ],
          components: {
            securitySchemes: {
              ApiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-Key'
              }
            }
          }
        },
        apis: ['./src/routes/*.js']
      };
      
      const specs = swaggerJsdoc(options);
      this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
      
      logger.info('Swagger documentation enabled at /api-docs');
      
    } catch (error) {
      logger.warn('Failed to setup Swagger documentation', { error: error.message });
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  _setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error: error.message });
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason: reason, promise: promise });
      process.exit(1);
    });
  }
}

// Create and start server if this file is run directly
if (require.main === module) {
  const server = new PQCEdgeAttestorServer();
  server.start().catch((error) => {
    logger.error('Failed to start application', { error: error.message });
    process.exit(1);
  });
}

module.exports = PQCEdgeAttestorServer;
