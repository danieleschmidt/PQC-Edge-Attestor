const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error in request', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: sanitizeBody(req.body),
    params: req.params,
    query: req.query,
    userId: req.user?.id,
    deviceId: req.device?.id,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map(error => ({
      field: error.path,
      message: error.message,
      value: error.value
    }));

    return res.status(400).json({
      error: 'Database validation failed',
      details: errors,
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return res.status(409).json({
      error: 'Duplicate entry',
      details: `${field} already exists`,
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: 'Foreign key constraint failed',
      details: 'Referenced record does not exist',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'SequelizeDatabaseError') {
    return res.status(500).json({
      error: 'Database error',
      details: 'An error occurred while processing your request',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      details: 'Please refresh your authentication token',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'CastError' || err.name === 'TypeError') {
    return res.status(400).json({
      error: 'Invalid data format',
      details: 'The provided data is in an incorrect format',
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Service unavailable',
      details: 'Unable to connect to external service',
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 'ENOTFOUND') {
    return res.status(502).json({
      error: 'Service not found',
      details: 'External service could not be reached',
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 'ENOENT') {
    return res.status(404).json({
      error: 'Resource not found',
      details: 'The requested resource could not be found',
      timestamp: new Date().toISOString()
    });
  }

  // Handle HTTP status errors
  if (err.status || err.statusCode) {
    const status = err.status || err.statusCode;
    return res.status(status).json({
      error: err.message || 'An error occurred',
      timestamp: new Date().toISOString()
    });
  }

  // Default to 500 for unhandled errors
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    error: 'Internal server error',
    details: isDevelopment ? err.message : 'An unexpected error occurred',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString(),
    requestId: req.id || generateRequestId()
  });
};

// 404 handler for undefined routes
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Route not found',
    details: `The endpoint ${req.method} ${req.url} does not exist`,
    timestamp: new Date().toISOString()
  });
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Request timeout handler
const timeoutHandler = (timeout = 30000) => {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          method: req.method,
          url: req.url,
          timeout,
          ipAddress: req.ip
        });

        res.status(408).json({
          error: 'Request timeout',
          details: 'The request took too long to process',
          timestamp: new Date().toISOString()
        });
      }
    }, timeout);

    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timer);
    });

    next();
  };
};

// Security error handler
const securityErrorHandler = (err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    logger.securityEvent('malformed_json_request', {
      error: err.message,
      method: req.method,
      url: req.url,
      ipAddress: req.ip,
      severity: 'low'
    });

    return res.status(400).json({
      error: 'Malformed JSON',
      details: 'The request body contains invalid JSON',
      timestamp: new Date().toISOString()
    });
  }

  if (err.type === 'entity.too.large') {
    logger.securityEvent('request_too_large', {
      error: err.message,
      method: req.method,
      url: req.url,
      ipAddress: req.ip,
      severity: 'medium'
    });

    return res.status(413).json({
      error: 'Request too large',
      details: 'The request body exceeds the maximum allowed size',
      timestamp: new Date().toISOString()
    });
  }

  next(err);
};

// Helper functions
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'signature', 
    'privateKey', 'cert', 'authorization', 'auth'
  ];
  
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function generateRequestId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  timeoutHandler,
  securityErrorHandler
};