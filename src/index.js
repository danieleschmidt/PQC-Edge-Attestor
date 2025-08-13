/**
 * @file index.js
 * @brief Enhanced main entry point for PQC-Edge-Attestor HTTP API server - Generation 2
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const winston = require('winston');

// Import enhanced middleware
const { errorHandler, notFoundHandler, asyncHandler } = require('./middleware/errorHandler');
const { 
    generateRequestId, 
    securityHeaders, 
    sanitizeInput, 
    auditLog, 
    validateContentType 
} = require('./middleware/security');
const { httpMetricsMiddleware, getMetrics } = require('./middleware/monitoring');
const {
    smartCompression,
    responseCache,
    requestOptimization,
    connectionPooling,
    contentOptimization,
    adaptiveRateLimit,
    performanceMonitoring,
    getOptimizationMetrics,
    triggerOptimization
} = require('./middleware/optimization');
const { quantumAcceleration, getAccelerationMetrics } = require('./middleware/quantumAcceleration');
const { advancedQuantumDefense } = require('./middleware/advancedQuantumDefense');

// Import services
const NotificationService = require('./services/notificationService');

// Import route modules
const pqcRoutes = require('./routes/pqc');
const attestationRoutes = require('./routes/attestation');
const deviceRoutes = require('./routes/devices');
const healthRoutes = require('./routes/health');
const { router: researchRoutes, cleanup: researchCleanup } = require('./routes/research');
const { router: mlStandardsRoutes, cleanup: mlStandardsCleanup } = require('./routes/mlStandards');
const quantumCloudRoutes = require('./routes/quantumCloud');

// Create Express application
const app = express();

// Initialize services
const notificationService = new NotificationService();

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pqc-edge-attestor' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Essential middleware (order matters!)
app.use(generateRequestId);
app.use(requestOptimization);
app.use(performanceMonitoring);
app.use(httpMetricsMiddleware);
app.use(quantumAcceleration());
app.use(advancedQuantumDefense());
app.use(securityHeaders);
app.use(adaptiveRateLimit());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? 
    process.env.CORS_ORIGINS.split(',') : 
    ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Smart compression middleware
app.use(smartCompression);

// Content type validation
app.use(validateContentType(['application/json', 'multipart/form-data']));

// Request parsing middleware with limits
app.use(express.json({ 
  limit: '10mb',
  strict: true
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Input sanitization
app.use(sanitizeInput);

// Connection pooling
app.use(connectionPooling);

// Content optimization
app.use(contentOptimization);

// Response caching (for GET requests)
app.use(responseCache({ ttl: 300 }));

// Audit logging
app.use(auditLog);

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Root endpoint with enhanced info
app.get('/', (req, res) => {
  res.json({
    name: 'PQC-Edge-Attestor',
    version: '1.0.0',
    description: 'Post-quantum cryptographic framework for IoT edge device attestation',
    environment: process.env.NODE_ENV || 'development',
    features: {
      quantumResistant: true,
      realTimeMonitoring: true,
      enterpriseSecurity: true,
      globalDeployment: true
    },
    endpoints: {
      health: '/health',
      api: '/api/v1',
      metrics: '/metrics',
      documentation: process.env.ENABLE_SWAGGER === 'true' ? '/api-docs' : null
    },
    security: {
      rateLimit: 'enabled',
      encryption: 'AES-256 + PQC',
      authentication: 'JWT + API Keys',
      monitoring: 'real-time'
    },
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

// Health check routes
app.use('/health', healthRoutes);

// Metrics endpoint
app.get('/metrics', asyncHandler(getMetrics));

// Optimization metrics endpoint
app.get('/api/v1/optimization/metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      ...getOptimizationMetrics(),
      quantumAcceleration: getAccelerationMetrics()
    },
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

// Manual optimization trigger
app.post('/api/v1/optimization/optimize', asyncHandler(async (req, res) => {
  const result = await triggerOptimization();
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
}));

// API routes
app.use('/api/v1/pqc', pqcRoutes);
app.use('/api/v1/attestation', attestationRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/research', researchRoutes);
app.use('/api/v1/ml-standards', mlStandardsRoutes);
app.use('/api/v1/quantum-cloud', quantumCloudRoutes);

// API status endpoint
app.get('/api/v1/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'operational',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      notifications: notificationService.getNotificationStats(),
      environment: process.env.NODE_ENV || 'development'
    },
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Send shutdown notification
  notificationService.sendNotification(
    'system',
    ['slack', 'webhook'],
    'PQC-Edge-Attestor server is shutting down gracefully',
    { priority: 'medium', subject: 'Server Shutdown' }
  );
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Cleanup research services
    try {
      await researchCleanup();
      await mlStandardsCleanup();
    } catch (error) {
      logger.warn('Research cleanup failed', { error: error.message });
    }
    
    // Close database connections, cleanup resources, etc.
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forceful shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Initialize services
async function initializeServices() {
  logger.info('Initializing services...');
  
  try {
    // Initialize attestation service with fallback
    try {
      const AttestationService = require('./services/attestationService');
      const attestationService = new AttestationService();
      if (typeof attestationService.initialize === 'function') {
        await attestationService.initialize();
      }
    } catch (error) {
      logger.warn('Attestation service initialization skipped', { error: error.message });
    }
    
    // Test notification channels
    const testResults = await notificationService.testChannels(['slack']);
    logger.info('Notification channel test results', testResults);
    
    logger.info('All services initialized successfully');
    return true;
  } catch (error) {
    logger.error('Service initialization failed', { error: error.message });
    
    // Send error notification
    await notificationService.sendAlert('service_initialization_failed', {
      error: error.message,
      severity: 'critical',
      timestamp: new Date().toISOString()
    });
    
    return false;
  }
}

// Start server
async function startServer() {
  const servicesReady = await initializeServices();
  
  if (!servicesReady) {
    logger.error('Failed to initialize services. Exiting...');
    process.exit(1);
  }

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    logger.info('PQC-Edge-Attestor server started', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      apiVersion: 'v1',
      pid: process.pid,
      features: {
        monitoring: true,
        notifications: true,
        security: 'enhanced',
        optimization: 'auto-scaling',
        caching: 'intelligent',
        compression: 'adaptive',
        generation: 3
      }
    });
    
    // Send startup notification
    notificationService.sendNotification(
      'system',
      ['slack', 'webhook'],
      `PQC-Edge-Attestor server started successfully on port ${PORT}`,
      { 
        priority: 'low', 
        subject: 'Server Startup',
        data: { port: PORT, generation: 2 }
      }
    );
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

// Export app and services for testing
module.exports = { 
  app, 
  notificationService 
};

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch(error => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  });
}