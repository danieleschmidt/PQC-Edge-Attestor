/**
 * @file jest.config.minimal.js
 * @brief Minimal Jest configuration for core testing
 */

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup/minimal.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setupAfterEnv.js'],
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testTimeout: 30000,
  verbose: true,
  collectCoverage: false, // Disable for faster testing
  clearMocks: true
};