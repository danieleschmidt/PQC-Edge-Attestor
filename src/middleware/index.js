const { 
  authMiddleware, 
  requireRole, 
  requirePermission, 
  deviceAuthMiddleware 
} = require('./auth');

const { 
  validateDevice, 
  validateAttestation, 
  validateOTAUpdate,
  validatePagination,
  validateUUID,
  validateRateLimit
} = require('./validation');

const { 
  errorHandler, 
  notFoundHandler, 
  asyncHandler, 
  timeoutHandler,
  securityErrorHandler
} = require('./errorHandler');

// Controller injection middleware
const controllerInjectionMiddleware = (dependencies) => {
  return (req, res, next) => {
    // Inject controller instances into request
    req.deviceController = dependencies.deviceController;
    req.attestationController = dependencies.attestationController;
    req.otaController = dependencies.otaController;
    
    next();
  };
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const logger = require('../utils/logger');
  const startTime = Date.now();

  // Generate unique request ID
  req.id = Math.random().toString(36).substring(2, 15);

  logger.info('Request started', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    userId: req.user?.id,
    deviceId: req.device?.id
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
      deviceId: req.device?.id,
      contentLength: res.get('Content-Length')
    });
  });

  next();
};

// CORS middleware
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Device-ID, X-Device-Signature, X-Timestamp');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
};

// Security headers middleware
const securityHeadersMiddleware = (req, res, next) => {
  // Security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Content-Security-Policy', "default-src 'self'");
  
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
};

// Request size limiting middleware
const requestSizeLimitMiddleware = (limit = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length']);
    const maxSize = parseSize(limit);

    if (contentLength && contentLength > maxSize) {
      return res.status(413).json({
        error: 'Request too large',
        details: `Request size ${contentLength} exceeds limit ${limit}`,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Helper function to parse size strings
function parseSize(size) {
  if (typeof size === 'number') return size;
  
  const units = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 1024 * 1024; // Default 1MB

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';

  return Math.floor(value * units[unit]);
}

module.exports = {
  // Authentication & Authorization
  authMiddleware,
  requireRole,
  requirePermission,
  deviceAuthMiddleware,

  // Validation
  validateDevice,
  validateAttestation,
  validateOTAUpdate,
  validatePagination,
  validateUUID,
  validateRateLimit,

  // Error Handling
  errorHandler,
  notFoundHandler,
  asyncHandler,
  timeoutHandler,
  securityErrorHandler,

  // Utility
  controllerInjectionMiddleware,
  requestLogger,
  corsMiddleware,
  securityHeadersMiddleware,
  requestSizeLimitMiddleware
};