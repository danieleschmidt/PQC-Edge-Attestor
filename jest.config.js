/**
 * @file jest.config.js
 * @brief Jest testing configuration for PQC-Edge-Attestor
 * 
 * Comprehensive testing setup with coverage, parallel execution,
 * and specialized configurations for unit, integration, and e2e tests.
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test directories and patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
    '/coverage/',
    '/docs/'
  ],
  
  // Module paths
  modulePaths: ['<rootDir>/src'],
  
  // Module directories
  moduleDirectories: [
    'node_modules',
    'src'
  ],
  
  // File extensions
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],
  
  // Setup files
  setupFiles: [
    '<rootDir>/tests/setup/jest.setup.js'
  ],
  
  // Setup files after environment
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setupAfterEnv.js'
  ],
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/index.js', // Exclude main entry point
    '!**/node_modules/**',
    '!**/vendor/**'
  ],
  
  // Coverage directory
  coverageDirectory: 'coverage',
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
    'cobertura'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/services/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/controllers/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Parallel execution
  maxWorkers: '50%',
  
  // Verbose output
  verbose: true,
  
  // Error handling
  bail: false,
  errorOnDeprecated: true,
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    '/node_modules/(?!(some-es6-module)/)',
  ],
  
  // Module name mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Clear mocks
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,
  
  // Mock configuration
  unmockedModulePathPatterns: [
    '/node_modules/'
  ],
  
  // Test result processor (commented out for now)
  // testResultsProcessor: 'jest-sonar-reporter',
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-reports',
        outputName: 'junit.xml',
        suiteName: 'PQC-Edge-Attestor Tests',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ],
    [
      'jest-html-reporters',
      {
        publicPath: './test-reports',
        filename: 'report.html',
        expand: true,
        hideIcon: false,
        pageTitle: 'PQC-Edge-Attestor Test Report'
      }
    ]
  ],
  
  // Watch mode configuration
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
    '/coverage/',
    '/logs/'
  ],
  
  // Notify mode
  notify: false,
  notifyMode: 'failure-change',
  
  // Projects for multi-project setup
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/unit.setup.js']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js'],
      testTimeout: 60000
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/e2e.setup.js'],
      testTimeout: 120000
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/tests/performance/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/performance.setup.js'],
      testTimeout: 300000
    }
  ],
  
  // Custom environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DB_NAME: 'pqc_attestor_test',
    DISABLE_LOGGING: 'true'
  },
  
  // Snapshot configuration
  snapshotSerializers: [
    'jest-serializer-json'
  ],
  
  // Dependencies to force into CommonJS
  forceExit: false,
  detectOpenHandles: true,
  detectLeaks: false,
  
  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Preset
  preset: null,
  
  // Runner
  runner: 'jest-runner',
  
  // Test name pattern
  testNamePattern: undefined,
  
  // Test sequence
  testSequencer: '@jest/test-sequencer',
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Timing
  slowTestThreshold: 5
};
