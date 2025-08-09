/**
 * @file minimal.setup.js
 * @brief Minimal Jest setup for basic testing
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock fs for unit tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn()
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  readFile: jest.fn(),
  mkdir: jest.fn()
}));

// Mock additional dependencies
jest.mock('winston', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn()
  },
  transports: {
    File: jest.fn(),
    Console: jest.fn()
  }
}));

// Global test utilities
global.testUtils = {
  randomString: (length = 10) => {
    return Math.random().toString(36).substring(2, length + 2);
  },
  
  randomBuffer: (size = 32) => {
    return Buffer.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)));
  }
};