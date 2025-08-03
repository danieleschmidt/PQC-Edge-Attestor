/**
 * @file globalSetup.js
 * @brief Global test setup for Jest test suite
 * 
 * Initializes test environment, starts test databases, and prepares
 * the testing infrastructure before running any tests.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async () => {
  console.log('🚀 Setting up test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.DB_NAME = 'pqc_attestor_test';
  process.env.SILENCE_CONSOLE = 'true';
  
  // Create necessary directories
  const directories = [
    path.join(__dirname, '../../logs'),
    path.join(__dirname, '../../temp'),
    path.join(__dirname, '../../test-reports'),
    path.join(__dirname, '../../coverage')
  ];
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Start test database if needed
  try {
    await startTestDatabase();
  } catch (error) {
    console.warn('⚠️  Could not start test database:', error.message);
    console.warn('   Tests will run with mocked database');
  }
  
  // Start TPM simulator if needed
  try {
    await startTPMSimulator();
  } catch (error) {
    console.warn('⚠️  Could not start TPM simulator:', error.message);
    console.warn('   Tests will run with mocked TPM');
  }
  
  console.log('✅ Test environment setup complete');
};

/**
 * Start test database container
 */
async function startTestDatabase() {
  return new Promise((resolve, reject) => {
    const dockerProcess = spawn('docker', [
      'run',
      '-d',
      '--name', 'pqc-test-db',
      '-p', '5433:5432',
      '-e', 'POSTGRES_DB=pqc_attestor_test',
      '-e', 'POSTGRES_USER=postgres',
      '-e', 'POSTGRES_PASSWORD=testpassword',
      '--rm',
      'postgres:15-alpine'
    ]);
    
    dockerProcess.on('close', (code) => {
      if (code === 0) {
        console.log('🐘 Test database started');
        
        // Wait for database to be ready
        setTimeout(() => {
          resolve();
        }, 5000);
      } else {
        reject(new Error(`Docker process exited with code ${code}`));
      }
    });
    
    dockerProcess.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Start TPM simulator
 */
async function startTPMSimulator() {
  return new Promise((resolve, reject) => {
    const tpmProcess = spawn('swtpm', [
      'socket',
      '--tpmstate', 'dir=/tmp/tpm-test',
      '--ctrl', 'type=tcp,port=2321',
      '--server', 'type=tcp,port=2322',
      '--daemon'
    ]);
    
    tpmProcess.on('close', (code) => {
      if (code === 0) {
        console.log('🔐 TPM simulator started');
        resolve();
      } else {
        reject(new Error(`TPM simulator exited with code ${code}`));
      }
    });
    
    tpmProcess.on('error', (error) => {
      // TPM simulator not available, continue without it
      resolve();
    });
    
    // Resolve after timeout even if TPM doesn't start
    setTimeout(() => {
      resolve();
    }, 3000);
  });
}
