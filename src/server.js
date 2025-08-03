#!/usr/bin/env node

/**
 * PQC Edge Attestor Server
 * 
 * Main entry point for the Post-Quantum Cryptography Edge Device Attestation service.
 * This server provides APIs for device registration, provisioning, attestation, and OTA updates.
 */

require('dotenv').config();
const { appInstance } = require('./app');
const logger = require('./utils/logger');

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  try {
    logger.info('Starting PQC Edge Attestor Server...', {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      environment: NODE_ENV,
      port: PORT,
      pid: process.pid
    });

    // Validate required environment variables
    validateEnvironment();

    // Start the application
    await appInstance.start(PORT);

    // Log startup success
    logger.info('🚀 PQC Edge Attestor Server is ready!', {
      port: PORT,
      environment: NODE_ENV,
      healthCheck: `http://localhost:${PORT}/health`,
      apiEndpoint: `http://localhost:${PORT}/api`,
      documentation: 'https://github.com/danieleschmidt/PQC-Edge-Attestor'
    });

    // Log available endpoints
    if (NODE_ENV === 'development') {
      logger.info('Available API endpoints:', {
        health: `GET http://localhost:${PORT}/health`,
        ready: `GET http://localhost:${PORT}/ready`,
        devices: `GET http://localhost:${PORT}/api/devices`,
        deviceRegister: `POST http://localhost:${PORT}/api/devices`,
        attestation: `POST http://localhost:${PORT}/api/attestation/:deviceId/submit`,
        otaUpdate: `POST http://localhost:${PORT}/api/ota/:deviceId/initiate`
      });
    }

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

function validateEnvironment() {
  const requiredVars = [];
  const optionalVars = [
    'JWT_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'ALLOWED_ORIGINS',
    'LOG_LEVEL'
  ];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is not set`);
    }
  }

  // Log environment configuration
  const envConfig = {
    nodeEnv: NODE_ENV,
    port: PORT,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasRedisUrl: !!process.env.REDIS_URL,
    logLevel: process.env.LOG_LEVEL || 'info'
  };

  logger.info('Environment configuration loaded', envConfig);

  // Security warnings for development
  if (NODE_ENV === 'development') {
    logger.warn('🔒 Development mode warnings:', {
      jwtSecret: !process.env.JWT_SECRET ? 'Using fallback JWT secret - set JWT_SECRET in production' : 'JWT secret configured',
      database: !process.env.DATABASE_URL ? 'Using default database connection' : 'Database URL configured',
      cors: !process.env.ALLOWED_ORIGINS ? 'CORS allowing all origins - configure ALLOWED_ORIGINS for production' : 'CORS origins configured'
    });
  }

  // Production security checks
  if (NODE_ENV === 'production') {
    const productionIssues = [];

    if (!process.env.JWT_SECRET) {
      productionIssues.push('JWT_SECRET must be set in production');
    }

    if (!process.env.DATABASE_URL) {
      productionIssues.push('DATABASE_URL should be configured for production');
    }

    if (productionIssues.length > 0) {
      logger.error('🚨 Production security issues detected:', productionIssues);
    }
  }
}

// Handle startup
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { startServer };