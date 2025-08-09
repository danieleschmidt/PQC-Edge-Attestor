/**
 * @file e2e.setup.js
 * @brief End-to-end test setup configuration
 */

// E2E test specific setup
global.testServer = null;

beforeAll(async () => {
  // Start test server for E2E tests
  const { app } = require('../../src/index');
  
  const port = process.env.TEST_PORT || 3001;
  global.testServer = app.listen(port);
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));
});

afterAll(async () => {
  // Close test server
  if (global.testServer) {
    await new Promise(resolve => global.testServer.close(resolve));
  }
});