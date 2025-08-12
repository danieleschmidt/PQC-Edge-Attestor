/**
 * @file jest.config.simple.js
 * @brief Simplified Jest configuration for testing
 */

module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
    '/coverage/'
  ],
  setupFiles: [
    '<rootDir>/tests/setup/jest.setup.js'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setupAfterEnv.js'
  ],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  maxWorkers: 1,
  verbose: true,
  clearMocks: true,
  detectOpenHandles: true,
  forceExit: true
};