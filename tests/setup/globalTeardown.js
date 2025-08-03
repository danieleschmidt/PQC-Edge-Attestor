/**
 * @file globalTeardown.js
 * @brief Global test teardown for Jest test suite
 * 
 * Cleans up test environment, stops test databases, and performs
 * cleanup after all tests have completed.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

module.exports = async () => {
  console.log('🧽 Cleaning up test environment...');
  
  // Stop test database
  try {
    await stopTestDatabase();
  } catch (error) {
    console.warn('⚠️  Could not stop test database:', error.message);
  }
  
  // Stop TPM simulator
  try {
    await stopTPMSimulator();
  } catch (error) {
    console.warn('⚠️  Could not stop TPM simulator:', error.message);
  }
  
  // Clean up temporary files
  try {
    await cleanupTempFiles();
  } catch (error) {
    console.warn('⚠️  Could not clean temp files:', error.message);
  }
  
  console.log('✅ Test environment cleanup complete');
};

/**
 * Stop test database container
 */
async function stopTestDatabase() {
  try {
    await execAsync('docker stop pqc-test-db 2>/dev/null || true');
    console.log('🐘 Test database stopped');
  } catch (error) {
    // Database wasn't running or docker not available
  }
}

/**
 * Stop TPM simulator
 */
async function stopTPMSimulator() {
  try {
    await execAsync('pkill -f "swtpm socket" 2>/dev/null || true');
    console.log('🔐 TPM simulator stopped');
  } catch (error) {
    // TPM simulator wasn't running
  }
}

/**
 * Clean up temporary files
 */
async function cleanupTempFiles() {
  try {
    await execAsync('rm -rf /tmp/tpm-test 2>/dev/null || true');
    await execAsync('rm -rf temp/* 2>/dev/null || true');
    console.log('🗑️  Temporary files cleaned');
  } catch (error) {
    // Files weren't there or permission issue
  }
}
