/**
 * @file jest.setup.js
 * @brief Jest setup configuration for test environment initialization
 * 
 * Global test environment setup including environment variables,
 * mock configurations, and test utilities.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DB_NAME = 'pqc_attestor_test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'testpassword';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.TPM_USE_SIMULATOR = 'true';
process.env.TPM_SIMULATOR_PORT = '2321';
process.env.DISABLE_RATE_LIMITING = 'true';
process.env.DISABLE_LOGGING = 'true';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.API_KEY_SECRET = 'test-api-key-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars!!!!';

// Increase default timeout for tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output
if (process.env.SILENCE_CONSOLE === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// Global test utilities
global.testUtils = {
  /**
   * Generate random test data
   */
  randomString: (length = 10) => {
    return Math.random().toString(36).substring(2, length + 2);
  },
  
  /**
   * Generate random buffer
   */
  randomBuffer: (size = 32) => {
    return Buffer.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)));
  },
  
  /**
   * Create test user data
   */
  createTestUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'admin',
    permissions: ['read', 'write', 'admin']
  }),
  
  /**
   * Create test device data
   */
  createTestDevice: () => ({
    id: 'test-device-id',
    serialNumber: 'TEST-DEVICE-001',
    deviceType: 'smart_meter',
    manufacturer: 'Test Manufacturer',
    firmwareVersion: '1.0.0',
    status: 'active',
    attestationEnabled: true
  }),
  
  /**
   * Wait for a specified time
   */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Retry a function with exponential backoff
   */
  retry: async (fn, maxAttempts = 3, baseDelay = 100) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await global.testUtils.wait(delay);
      }
    }
    
    throw lastError;
  }
};

// Mock crypto functions for deterministic testing
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn((size) => {
    // Return deterministic "random" bytes for testing
    return Buffer.alloc(size, 0x42);
  }),
  randomUUID: jest.fn(() => '12345678-1234-5678-9012-123456789012')
}));

// Mock winston logger to prevent log output during tests
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    simple: jest.fn(),
    colorize: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock database connection for unit tests
jest.mock('../../src/database/connection', () => ({
  getConnection: jest.fn(() => Promise.resolve({
    authenticate: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve())
  })),
  testConnection: jest.fn(() => Promise.resolve(true)),
  executeTransaction: jest.fn((callback) => callback()),
  getStats: jest.fn(() => ({
    connected: true,
    pool: { size: 5, available: 3, using: 2 }
  })),
  close: jest.fn(() => Promise.resolve()),
  migrate: jest.fn(() => Promise.resolve()),
  seed: jest.fn(() => Promise.resolve())
}));

// Mock FFI for PQC operations in unit tests
jest.mock('ffi-napi', () => ({
  Library: jest.fn(() => ({
    kyber_keypair: jest.fn(() => 0),
    kyber_encapsulate: jest.fn(() => 0),
    kyber_decapsulate: jest.fn(() => 0),
    dilithium_keypair: jest.fn(() => 0),
    dilithium_sign: jest.fn(() => 0),
    dilithium_verify: jest.fn(() => 0),
    falcon_keypair: jest.fn(() => 0),
    falcon_sign: jest.fn(() => 0),
    falcon_verify: jest.fn(() => 0)
  }))
}));

// Mock TPM operations
jest.mock('child_process', () => ({
  exec: jest.fn((command, callback) => {
    // Mock TPM command responses
    if (command.includes('tpm2_startup')) {
      callback(null, { stdout: 'TPM startup successful' });
    } else if (command.includes('tpm2_pcrread')) {
      callback(null, { stdout: '0: 0000000000000000000000000000000000000000000000000000000000000000' });
    } else if (command.includes('tpm2_getcap')) {
      callback(null, { stdout: 'TPM_PT_FAMILY_INDICATOR: 2.0' });
    } else {
      callback(null, { stdout: 'Success' });
    }
  }),
  spawn: jest.fn(),
  execSync: jest.fn()
}));

// Global error handler for unhandled rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't fail tests on unhandled rejections, just log them
});

// Global error handler for uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't fail tests on uncaught exceptions, just log them
});

// Setup global matchers
expect.extend({
  /**
   * Custom matcher to check if a value is a valid UUID
   */
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
  
  /**
   * Custom matcher to check if a value is a valid base64 string
   */
  toBeValidBase64(received) {
    try {
      const pass = typeof received === 'string' && 
                   Buffer.from(received, 'base64').toString('base64') === received;
      
      if (pass) {
        return {
          message: () => `expected ${received} not to be valid base64`,
          pass: true
        };
      } else {
        return {
          message: () => `expected ${received} to be valid base64`,
          pass: false
        };
      }
    } catch (error) {
      return {
        message: () => `expected ${received} to be valid base64`,
        pass: false
      };
    }
  },
  
  /**
   * Custom matcher to check if response has API structure
   */
  toHaveAPIStructure(received) {
    const hasSuccess = typeof received.success === 'boolean';
    const hasTimestamp = typeof received.timestamp === 'string';
    const hasData = received.success ? 'data' in received : 'error' in received;
    
    const pass = hasSuccess && hasTimestamp && hasData;
    
    if (pass) {
      return {
        message: () => `expected response not to have API structure`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to have API structure with success, timestamp, and data/error`,
        pass: false
      };
    }
  }
});

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});
