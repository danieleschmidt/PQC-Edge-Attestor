/**
 * @file integration.setup.js
 * @brief Integration test setup configuration
 */

// Integration test specific setup
beforeAll(async () => {
  // Create test directories
  const fs = require('fs');
  const dirs = ['logs', 'data', 'test-output'];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});

afterAll(async () => {
  // Cleanup test artifacts
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Clean up test files
    if (fs.existsSync('test-output')) {
      fs.rmSync('test-output', { recursive: true, force: true });
    }
  } catch (error) {
    console.warn('Cleanup failed:', error.message);
  }
});