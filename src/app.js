const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Import database and models
const { sequelize } = require('./database/connection');
const { Device } = require('./models');

// Import repositories
const { DeviceRepository } = require('./repositories');
const BaseRepository = require('./repositories/BaseRepository');

// Import services
const { CryptoService, AttestationService } = require('./services');

// Import controllers
const DeviceController = require('./controllers/DeviceController');
const AttestationController = require('./controllers/AttestationController');
const OTAController = require('./controllers/OTAController');

// Import middleware
const {
  corsMiddleware,
  securityHeadersMiddleware,
  requestLogger,
  controllerInjectionMiddleware,
  errorHandler,
  notFoundHandler,
  securityErrorHandler,
  timeoutHandler,
  requestSizeLimitMiddleware
} = require('./middleware');

// Import routes
const apiRoutes = require('./routes');

// Import utilities
const logger = require('./utils/logger');
const CacheManager = require('./utils/cache');

class PQCEdgeAttestorApp {
  constructor() {
    this.app = express();
    this.server = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.app;
    }

    try {
      logger.info('Initializing PQC Edge Attestor application...');

      // Initialize database
      await this.initializeDatabase();

      // Initialize services
      await this.initializeServices();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      this.isInitialized = true;
      logger.info('PQC Edge Attestor application initialized successfully');

      return this.app;

    } catch (error) {
      logger.error('Failed to initialize application', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async initializeDatabase() {
    try {
      logger.info('Connecting to database...');
      
      await sequelize.authenticate();
      logger.info('Database connection established successfully');

      // Run migrations in production
      if (process.env.NODE_ENV === 'production') {
        logger.info('Running database migrations...');
        await sequelize.sync();
        logger.info('Database migrations completed');
      } else {
        // In development, sync models
        await sequelize.sync({ alter: true });
        logger.info('Database models synchronized');
      }

    } catch (error) {
      logger.error('Database initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  async initializeServices() {
    try {
      logger.info('Initializing services...');

      // Initialize cache manager
      this.cacheManager = new CacheManager();
      await this.cacheManager.connect();

      // Initialize repositories
      this.deviceRepository = new DeviceRepository(Device, this.cacheManager);

      // Initialize services
      this.cryptoService = new CryptoService();
      this.attestationService = new AttestationService();

      // Initialize controllers
      this.deviceController = new DeviceController(
        this.deviceRepository,
        this.cryptoService,
        this.cacheManager
      );

      this.attestationController = new AttestationController(
        this.attestationService,
        this.deviceRepository,
        this.cacheManager
      );

      this.otaController = new OTAController(
        this.deviceRepository,
        this.cryptoService,
        this.cacheManager
      );

      logger.info('Services initialized successfully');

    } catch (error) {
      logger.error('Service initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  setupMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);

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
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // Request size limiting
    this.app.use(requestSizeLimitMiddleware('10mb'));

    // Compression
    this.app.use(compression());

    // CORS
    this.app.use(corsMiddleware);

    // Security headers
    this.app.use(securityHeadersMiddleware);

    // Request timeout
    this.app.use(timeoutHandler(30000)); // 30 seconds

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Security error handling for malformed requests
    this.app.use(securityErrorHandler);

    // Request logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    this.app.use(requestLogger);

    // Controller injection
    this.app.use(controllerInjectionMiddleware({
      deviceController: this.deviceController,
      attestationController: this.attestationController,
      otaController: this.otaController
    }));
  }

  setupRoutes() {
    // Health check (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        database: sequelize.getDatabaseName(),
        uptime: process.uptime()
      });
    });

    // Ready check (includes database connectivity)
    this.app.get('/ready', async (req, res) => {
      try {
        await sequelize.authenticate();
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          database: 'connected',
          cache: this.cacheManager ? 'connected' : 'disconnected'
        });
      } catch (error) {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'PQC Edge Attestor API',
        version: '1.0.0',
        description: 'Post-Quantum Cryptography framework for IoT edge device attestation',
        documentation: 'https://github.com/danieleschmidt/PQC-Edge-Attestor',
        endpoints: {
          health: '/health',
          ready: '/ready',
          api: '/api',
          devices: '/api/devices',
          attestation: '/api/attestation',
          ota: '/api/ota'
        }
      });
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      this.gracefulShutdown('SIGTERM');
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason,
        promise: promise
      });
      this.gracefulShutdown('SIGTERM');
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  async start(port = process.env.PORT || 3000) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      this.server = this.app.listen(port, () => {
        logger.info(`PQC Edge Attestor server started`, {
          port: port,
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          pid: process.pid
        });
      });

      return this.server;

    } catch (error) {
      logger.error('Failed to start server', {
        error: error.message,
        port: port
      });
      throw error;
    }
  }

  async gracefulShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    if (this.server) {
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close database connection
          if (sequelize) {
            await sequelize.close();
            logger.info('Database connection closed');
          }

          // Close cache connection
          if (this.cacheManager) {
            await this.cacheManager.disconnect();
            logger.info('Cache connection closed');
          }

          logger.info('Graceful shutdown completed');
          process.exit(0);

        } catch (error) {
          logger.error('Error during graceful shutdown', {
            error: error.message
          });
          process.exit(1);
        }
      });
    } else {
      process.exit(0);
    }

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  }

  getApp() {
    return this.app;
  }

  getServer() {
    return this.server;
  }
}

// Export singleton instance for use in tests and main entry point
const appInstance = new PQCEdgeAttestorApp();

module.exports = appInstance.getApp.bind(appInstance);
module.exports.PQCEdgeAttestorApp = PQCEdgeAttestorApp;
module.exports.appInstance = appInstance;