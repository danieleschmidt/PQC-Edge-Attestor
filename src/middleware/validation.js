const { ValidationError } = require('../utils/validators');
const logger = require('../utils/logger');

const validateDevice = (req, res, next) => {
  try {
    const { 
      serialNumber, 
      deviceType, 
      hardwareVersion, 
      firmwareVersion, 
      manufacturer, 
      model 
    } = req.body;

    const errors = [];

    // Required fields validation
    if (!serialNumber) errors.push('serialNumber is required');
    if (!deviceType) errors.push('deviceType is required');
    if (!hardwareVersion) errors.push('hardwareVersion is required');
    if (!firmwareVersion) errors.push('firmwareVersion is required');
    if (!manufacturer) errors.push('manufacturer is required');
    if (!model) errors.push('model is required');

    // Format validation
    if (serialNumber && (typeof serialNumber !== 'string' || serialNumber.length < 8 || serialNumber.length > 64)) {
      errors.push('serialNumber must be 8-64 characters');
    }

    if (deviceType && !['smart_meter', 'ev_charger', 'gateway', 'sensor'].includes(deviceType)) {
      errors.push('deviceType must be one of: smart_meter, ev_charger, gateway, sensor');
    }

    if (hardwareVersion && !/^\d+\.\d+\.\d+$/.test(hardwareVersion)) {
      errors.push('hardwareVersion must be in format x.y.z');
    }

    if (firmwareVersion && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(firmwareVersion)) {
      errors.push('firmwareVersion must be in format x.y.z or x.y.z-suffix');
    }

    if (manufacturer && (typeof manufacturer !== 'string' || manufacturer.length < 2 || manufacturer.length > 100)) {
      errors.push('manufacturer must be 2-100 characters');
    }

    if (model && (typeof model !== 'string' || model.length < 2 || model.length > 100)) {
      errors.push('model must be 2-100 characters');
    }

    if (errors.length > 0) {
      logger.warn('Device validation failed', {
        errors,
        deviceData: req.body,
        ipAddress: req.ip
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Device validation error', {
      error: error.message,
      deviceData: req.body
    });

    res.status(500).json({
      error: 'Validation error'
    });
  }
};

const validateAttestation = (req, res, next) => {
  try {
    const { measurements, signature, nonce } = req.body;
    const errors = [];

    // Required fields
    if (!measurements) errors.push('measurements is required');
    if (!signature) errors.push('signature is required');
    if (!nonce) errors.push('nonce is required');

    // Type validation
    if (measurements && typeof measurements !== 'object') {
      errors.push('measurements must be an object');
    }

    if (signature && typeof signature !== 'string') {
      errors.push('signature must be a string');
    }

    if (nonce && (typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 64)) {
      errors.push('nonce must be a string of 16-64 characters');
    }

    // Nonce format validation (hex)
    if (nonce && !/^[a-f0-9]+$/i.test(nonce)) {
      errors.push('nonce must be hexadecimal');
    }

    if (errors.length > 0) {
      logger.warn('Attestation validation failed', {
        errors,
        deviceId: req.params.deviceId,
        ipAddress: req.ip
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Attestation validation error', {
      error: error.message,
      deviceId: req.params.deviceId
    });

    res.status(500).json({
      error: 'Validation error'
    });
  }
};

const validateOTAUpdate = (req, res, next) => {
  try {
    const { firmwareUrl, version, checksumSHA256, signature } = req.body;
    const errors = [];

    // Required fields
    if (!firmwareUrl) errors.push('firmwareUrl is required');
    if (!version) errors.push('version is required');
    if (!checksumSHA256) errors.push('checksumSHA256 is required');
    if (!signature) errors.push('signature is required');

    // Format validation
    if (firmwareUrl && (typeof firmwareUrl !== 'string' || !isValidUrl(firmwareUrl))) {
      errors.push('firmwareUrl must be a valid URL');
    }

    if (version && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(version)) {
      errors.push('version must be in format x.y.z or x.y.z-suffix');
    }

    if (checksumSHA256 && (typeof checksumSHA256 !== 'string' || !/^[a-f0-9]{64}$/i.test(checksumSHA256))) {
      errors.push('checksumSHA256 must be a 64-character hex string');
    }

    if (signature && typeof signature !== 'string') {
      errors.push('signature must be a string');
    }

    if (errors.length > 0) {
      logger.warn('OTA update validation failed', {
        errors,
        deviceId: req.params.deviceId,
        ipAddress: req.ip
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    next();

  } catch (error) {
    logger.error('OTA update validation error', {
      error: error.message,
      deviceId: req.params.deviceId
    });

    res.status(500).json({
      error: 'Validation error'
    });
  }
};

const validatePagination = (req, res, next) => {
  try {
    const { page, limit } = req.query;

    if (page && (!Number.isInteger(Number(page)) || Number(page) < 1)) {
      return res.status(400).json({
        error: 'page must be a positive integer'
      });
    }

    if (limit && (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
      return res.status(400).json({
        error: 'limit must be an integer between 1 and 100'
      });
    }

    next();

  } catch (error) {
    logger.error('Pagination validation error', {
      error: error.message
    });

    res.status(500).json({
      error: 'Validation error'
    });
  }
};

const validateUUID = (paramName) => {
  return (req, res, next) => {
    try {
      const value = req.params[paramName];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!value || !uuidRegex.test(value)) {
        return res.status(400).json({
          error: `${paramName} must be a valid UUID`
        });
      }

      next();

    } catch (error) {
      logger.error('UUID validation error', {
        error: error.message,
        paramName,
        value: req.params[paramName]
      });

      res.status(500).json({
        error: 'Validation error'
      });
    }
  };
};

// Helper function to validate URLs
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (_) {
    return false;
  }
}

// Rate limiting validation
const validateRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const identifier = req.ip + (req.user?.id || '');
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    if (requests.has(identifier)) {
      requests.set(identifier, requests.get(identifier).filter(time => time > windowStart));
    } else {
      requests.set(identifier, []);
    }

    const requestCount = requests.get(identifier).length;

    if (requestCount >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        identifier,
        requestCount,
        maxRequests,
        endpoint: req.path
      });

      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    // Add current request
    requests.get(identifier).push(now);
    next();
  };
};

module.exports = {
  validateDevice,
  validateAttestation,
  validateOTAUpdate,
  validatePagination,
  validateUUID,
  validateRateLimit
};