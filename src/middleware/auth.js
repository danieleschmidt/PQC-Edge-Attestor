const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      logger.warn('Authentication failed - no token provided', {
        endpoint: req.path,
        method: req.method,
        ipAddress: req.ip
      });
      
      return res.status(401).json({
        error: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    
    // Add user info to request
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      permissions: decoded.permissions || []
    };

    // Log successful authentication
    logger.debug('Authentication successful', {
      userId: req.user.id,
      role: req.user.role,
      endpoint: req.path,
      method: req.method
    });

    next();

  } catch (error) {
    logger.warn('Authentication failed - invalid token', {
      error: error.message,
      endpoint: req.path,
      method: req.method,
      ipAddress: req.ip
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token'
      });
    }

    res.status(500).json({
      error: 'Authentication error'
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    const hasRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      logger.warn('Authorization failed - insufficient permissions', {
        userId: req.user.id,
        userRoles,
        requiredRoles,
        endpoint: req.path,
        method: req.method
      });

      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    if (!req.user.permissions.includes(permission)) {
      logger.warn('Authorization failed - missing permission', {
        userId: req.user.id,
        requiredPermission: permission,
        userPermissions: req.user.permissions,
        endpoint: req.path,
        method: req.method
      });

      return res.status(403).json({
        error: `Permission required: ${permission}`
      });
    }

    next();
  };
};

// Device authentication for device-to-server communication
const deviceAuthMiddleware = async (req, res, next) => {
  try {
    const deviceId = req.header('X-Device-ID');
    const signature = req.header('X-Device-Signature');
    const timestamp = req.header('X-Timestamp');

    if (!deviceId || !signature || !timestamp) {
      return res.status(401).json({
        error: 'Device authentication headers missing'
      });
    }

    // Check timestamp to prevent replay attacks
    const requestTime = new Date(timestamp);
    const now = new Date();
    const timeDiff = Math.abs(now - requestTime);
    
    if (timeDiff > 300000) { // 5 minutes
      return res.status(401).json({
        error: 'Request timestamp too old'
      });
    }

    // In a real implementation, verify the device signature
    // This would involve looking up the device's public key and verifying the signature
    // of the request body + timestamp
    
    req.device = {
      id: deviceId,
      authenticated: true
    };

    logger.debug('Device authentication successful', {
      deviceId,
      endpoint: req.path,
      method: req.method
    });

    next();

  } catch (error) {
    logger.error('Device authentication failed', {
      error: error.message,
      deviceId: req.header('X-Device-ID'),
      endpoint: req.path,
      method: req.method
    });

    res.status(401).json({
      error: 'Device authentication failed'
    });
  }
};

module.exports = {
  authMiddleware,
  requireRole,
  requirePermission,
  deviceAuthMiddleware
};