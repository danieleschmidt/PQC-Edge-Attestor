const { createConnection } = require('../src/database/connection');
const CacheManager = require('../src/cache/CacheManager');
const logger = require('../src/utils/logger');

// Global test setup
beforeAll(async () => {
  // Setup test database connection
  const dbConnection = createConnection({
    database: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/pqc_attestor_test',
    logging: false, // Disable SQL logging in tests
    dialectOptions: {
      ssl: false
    }
  });

  try {
    await dbConnection.connect();
    logger.info('Test database connected');
  } catch (error) {
    logger.warn('Test database connection failed, using mock', { error: error.message });
  }

  // Setup test cache
  const cacheManager = new CacheManager({
    host: 'localhost',
    port: 6379,
    db: 1, // Use different database for tests
    defaultTTL: 60 // Shorter TTL for tests
  });

  try {
    await cacheManager.connect();
    logger.info('Test cache connected');
  } catch (error) {
    logger.warn('Test cache connection failed, using mock', { error: error.message });
  }

  // Store references globally for tests
  global.testDb = dbConnection;
  global.testCache = cacheManager;
});

// Global test teardown
afterAll(async () => {
  try {
    if (global.testDb) {
      await global.testDb.disconnect();
      logger.info('Test database disconnected');
    }

    if (global.testCache) {
      await global.testCache.disconnect();
      logger.info('Test cache disconnected');
    }
  } catch (error) {
    logger.error('Test cleanup failed', { error: error.message });
  }
});

// Clean up between tests
beforeEach(async () => {
  try {
    // Clear cache between tests
    if (global.testCache && global.testCache.isHealthy()) {
      await global.testCache.flush();
    }
  } catch (error) {
    // Ignore cache cleanup errors
  }
});

// Custom matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false
      };
    }
  },

  toBeValidHex(received, expectedLength = null) {
    const hexRegex = /^[a-f0-9]+$/i;
    const isValidHex = typeof received === 'string' && hexRegex.test(received);
    const hasCorrectLength = expectedLength ? received.length === expectedLength : true;
    const pass = isValidHex && hasCorrectLength;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be valid hex${expectedLength ? ` of length ${expectedLength}` : ''}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be valid hex${expectedLength ? ` of length ${expectedLength}` : ''}`,
        pass: false
      };
    }
  },

  toBeValidTimestamp(received) {
    const timestamp = new Date(received);
    const pass = !isNaN(timestamp.getTime());
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid timestamp`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid timestamp`,
        pass: false
      };
    }
  },

  toHaveValidSignature(received, algorithm = 'dilithium5') {
    const hasSignature = received && typeof received.signature === 'string';
    const hasAlgorithm = received && received.signatureAlgorithm === algorithm;
    const pass = hasSignature && hasAlgorithm;
    
    if (pass) {
      return {
        message: () => `expected object not to have valid ${algorithm} signature`,
        pass: true
      };
    } else {
      return {
        message: () => `expected object to have valid ${algorithm} signature`,
        pass: false
      };
    }
  }
});

// Test utilities
global.testUtils = {
  // Generate test device data
  createTestDevice: (overrides = {}) => ({
    serialNumber: `TEST${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
    deviceType: 'smart_meter',
    hardwareVersion: '1.0.0',
    firmwareVersion: '2.1.0',
    manufacturer: 'TestCorp',
    model: 'TestMeter-3000',
    status: 'unprovisioned',
    ...overrides
  }),

  // Generate test attestation report data
  createTestAttestationReport: (deviceId, overrides = {}) => ({
    deviceId,
    nonce: 'a'.repeat(32),
    measurements: {
      firmware_hash: 'f'.repeat(64),
      bootloader_hash: 'b'.repeat(64),
      configuration_hash: 'c'.repeat(64),
      pcr_values: [
        { index: 0, value: '0'.repeat(64), algorithm: 'sha256' },
        { index: 1, value: '1'.repeat(64), algorithm: 'sha256' }
      ]
    },
    signatureAlgorithm: 'dilithium5',
    attestationLevel: 'device',
    platformInfo: {
      hardwareVersion: '1.0.0',
      firmwareVersion: '2.1.0'
    },
    ...overrides
  }),

  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate secure random data for tests
  randomHex: (length) => {
    const crypto = require('crypto');
    return crypto.randomBytes(length / 2).toString('hex');
  },

  // Mock TPM operations
  mockTPMOperations: () => {
    return {
      readPCR: jest.fn().mockResolvedValue('0'.repeat(64)),
      extendPCR: jest.fn().mockResolvedValue(true),
      quote: jest.fn().mockResolvedValue({
        quoted: 'q'.repeat(64),
        signature: 's'.repeat(128)
      })
    };
  },

  // Mock crypto operations
  mockCryptoOperations: () => {
    return {
      generateKeyPair: jest.fn().mockResolvedValue({
        publicKey: 'pub'.repeat(32),
        privateKey: 'priv'.repeat(32)
      }),
      sign: jest.fn().mockResolvedValue('sig'.repeat(64)),
      verify: jest.fn().mockResolvedValue(true),
      encapsulate: jest.fn().mockResolvedValue({
        ciphertext: 'cipher'.repeat(32),
        sharedSecret: 'secret'.repeat(16)
      }),
      decapsulate: jest.fn().mockResolvedValue('secret'.repeat(16))
    };
  },

  // Create test server instance
  createTestServer: async () => {
    const PQCEdgeAttestor = require('../src/index');
    const server = new PQCEdgeAttestor({
      port: 0, // Use random port
      environment: 'test',
      enableRateLimit: false,
      enableSecurity: false
    });
    
    return server;
  },

  // Database helpers
  cleanupDatabase: async () => {
    if (global.testDb && global.testDb.isConnected) {
      try {
        await global.testDb.executeQuery('TRUNCATE TABLE attestation_reports CASCADE');
        await global.testDb.executeQuery('TRUNCATE TABLE devices CASCADE');
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  },

  // Performance testing utilities
  measurePerformance: async (fn, iterations = 1) => {
    const start = process.hrtime.bigint();
    
    for (let i = 0; i < iterations; i++) {
      await fn();
    }
    
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1000000; // Convert to milliseconds
    
    return {
      totalTime: durationMs,
      averageTime: durationMs / iterations,
      iterations
    };
  }
};

// Console override for cleaner test output
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: process.env.VERBOSE_TESTS ? originalConsole.log : () => {},
  debug: process.env.VERBOSE_TESTS ? originalConsole.debug : () => {},
  info: process.env.VERBOSE_TESTS ? originalConsole.info : () => {},
  warn: originalConsole.warn,
  error: originalConsole.error
};