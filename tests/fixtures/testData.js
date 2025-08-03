/**
 * @file testData.js
 * @brief Test fixtures and sample data for testing
 * 
 * Provides standardized test data for consistent testing across
 * unit, integration, and end-to-end test suites.
 */

const crypto = require('crypto');

/**
 * Generate deterministic test keys for consistent testing
 */
function generateTestKeys() {
  return {
    kyber: {
      publicKey: Buffer.alloc(1568, 0x42), // Kyber-1024 public key size
      secretKey: Buffer.alloc(3168, 0x43)  // Kyber-1024 secret key size
    },
    dilithium: {
      publicKey: Buffer.alloc(2592, 0x44), // Dilithium-5 public key size
      secretKey: Buffer.alloc(4864, 0x45)  // Dilithium-5 secret key size
    },
    falcon: {
      publicKey: Buffer.alloc(1793, 0x46), // Falcon-1024 public key size
      secretKey: Buffer.alloc(2305, 0x47)  // Falcon-1024 secret key size
    }
  };
}

/**
 * Sample device data for testing
 */
const sampleDevices = {
  smartMeter: {
    id: 'device-001',
    serialNumber: 'SM-001-TEST',
    deviceType: 'smart_meter',
    manufacturer: 'Test Meter Corp',
    model: 'TM-1000',
    firmwareVersion: '1.2.3',
    hardwareVersion: '1.0',
    status: 'active',
    attestationEnabled: true,
    lastSeen: new Date().toISOString(),
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
      address: '123 Test Street, Test City, TC 12345'
    },
    networkConfig: {
      ipAddress: '192.168.1.100',
      macAddress: '00:11:22:33:44:55',
      protocol: 'cellular'
    },
    capabilities: [
      'pqc_kyber',
      'pqc_dilithium',
      'tpm_attestation',
      'secure_boot'
    ]
  },
  
  evCharger: {
    id: 'device-002',
    serialNumber: 'EV-002-TEST',
    deviceType: 'ev_charger',
    manufacturer: 'Test Charger Inc',
    model: 'TC-5000',
    firmwareVersion: '2.1.0',
    hardwareVersion: '2.0',
    status: 'active',
    attestationEnabled: true,
    lastSeen: new Date().toISOString(),
    location: {
      latitude: 40.7128,
      longitude: -74.0060,
      address: '456 Charge Avenue, Charge City, CC 67890'
    },
    networkConfig: {
      ipAddress: '192.168.1.101',
      macAddress: '00:AA:BB:CC:DD:EE',
      protocol: 'ethernet'
    },
    capabilities: [
      'pqc_kyber',
      'pqc_falcon',
      'tpm_attestation',
      'ocpp_2_0',
      'iso15118'
    ],
    chargingConfig: {
      maxPower: 50000, // 50kW
      connectorTypes: ['CCS', 'CHAdeMO'],
      protocols: ['OCPP 2.0.1']
    }
  },
  
  iotGateway: {
    id: 'device-003',
    serialNumber: 'GW-003-TEST',
    deviceType: 'iot_gateway',
    manufacturer: 'Test Gateway LLC',
    model: 'TG-100',
    firmwareVersion: '1.5.2',
    hardwareVersion: '1.1',
    status: 'active',
    attestationEnabled: true,
    lastSeen: new Date().toISOString(),
    location: {
      latitude: 51.5074,
      longitude: -0.1278,
      address: '789 Gateway Road, Gateway Town, GT 11111'
    },
    networkConfig: {
      ipAddress: '192.168.1.102',
      macAddress: '00:FF:EE:DD:CC:BB',
      protocol: 'wifi'
    },
    capabilities: [
      'pqc_dilithium',
      'pqc_falcon',
      'tpm_attestation',
      'mesh_networking',
      'edge_computing'
    ]
  }
};

/**
 * Sample attestation reports for testing
 */
const sampleAttestationReports = {
  validReport: {
    header: {
      version: '1.0',
      deviceId: 'device-001',
      deviceType: 'smart_meter',
      timestamp: new Date().toISOString(),
      nonce: '1234567890abcdef',
      attestationType: 'tpm_based'
    },
    platformMeasurements: {
      pcr_0: {
        index: 0,
        algorithm: 'sha256',
        value: '0000000000000000000000000000000000000000000000000000000000000000',
        timestamp: new Date().toISOString()
      },
      pcr_1: {
        index: 1,
        algorithm: 'sha256',
        value: '1111111111111111111111111111111111111111111111111111111111111111',
        timestamp: new Date().toISOString()
      },
      pcr_7: {
        index: 7,
        algorithm: 'sha256',
        value: '7777777777777777777777777777777777777777777777777777777777777777',
        timestamp: new Date().toISOString()
      }
    },
    securityState: {
      secureBootEnabled: true,
      firmwareVersion: '1.2.3',
      tpmPresent: true,
      measurementTimestamp: new Date().toISOString()
    },
    tpmQuote: {
      message: Buffer.alloc(32, 0x55).toString('base64'),
      signature: Buffer.alloc(256, 0x66).toString('base64'),
      pcrs: Buffer.alloc(64, 0x77).toString('base64'),
      nonce: '1234567890abcdef'
    }
  },
  
  invalidReport: {
    header: {
      version: '1.0',
      deviceId: 'device-002',
      deviceType: 'ev_charger',
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour old
      nonce: 'fedcba0987654321',
      attestationType: 'tpm_based'
    },
    platformMeasurements: {
      pcr_0: {
        index: 0,
        algorithm: 'sha256',
        value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        timestamp: new Date(Date.now() - 3600000).toISOString()
      }
    },
    securityState: {
      secureBootEnabled: false, // Security violation
      firmwareVersion: '0.9.0', // Outdated
      tpmPresent: true,
      measurementTimestamp: new Date(Date.now() - 3600000).toISOString()
    }
  }
};

/**
 * Sample user data for testing
 */
const sampleUsers = {
  admin: {
    id: 'user-001',
    email: 'admin@test.com',
    username: 'admin',
    role: 'admin',
    permissions: ['read', 'write', 'admin', 'manage_devices'],
    status: 'active',
    lastLogin: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  
  operator: {
    id: 'user-002',
    email: 'operator@test.com',
    username: 'operator',
    role: 'operator',
    permissions: ['read', 'write', 'manage_devices'],
    status: 'active',
    lastLogin: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  
  viewer: {
    id: 'user-003',
    email: 'viewer@test.com',
    username: 'viewer',
    role: 'viewer',
    permissions: ['read'],
    status: 'active',
    lastLogin: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }
};

/**
 * Sample API responses for testing
 */
const sampleAPIResponses = {
  success: {
    success: true,
    data: {
      message: 'Operation completed successfully'
    },
    timestamp: new Date().toISOString()
  },
  
  error: {
    success: false,
    error: {
      message: 'Test error message',
      code: 'TEST_ERROR',
      details: 'This is a test error for testing purposes'
    },
    timestamp: new Date().toISOString()
  },
  
  validationError: {
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [
        {
          field: 'testField',
          message: 'Test field is required'
        }
      ]
    },
    timestamp: new Date().toISOString()
  }
};

/**
 * Sample cryptographic test vectors
 */
const cryptoTestVectors = {
  messages: {
    short: Buffer.from('Hello, World!', 'utf8'),
    medium: Buffer.from('This is a medium length test message for cryptographic operations.', 'utf8'),
    long: Buffer.from('This is a very long test message that should be used for testing cryptographic operations with larger data sizes. It contains multiple sentences and should provide a good test case for various scenarios.', 'utf8'),
    binary: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F]),
    unicode: Buffer.from('Test message with unicode: αβγδε 🔐🔑🔒', 'utf8')
  },
  
  hashes: {
    sha256: {
      'Hello, World!': '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3',
      '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    }
  }
};

/**
 * Performance test data
 */
const performanceTestData = {
  keyGenerationTargets: {
    kyber: {
      maxTime: 5000,     // 5 seconds
      averageTime: 2000  // 2 seconds
    },
    dilithium: {
      maxTime: 10000,    // 10 seconds
      averageTime: 5000  // 5 seconds
    },
    falcon: {
      maxTime: 15000,    // 15 seconds
      averageTime: 8000  // 8 seconds
    }
  },
  
  operationTargets: {
    kyberEncaps: {
      maxTime: 100,   // 100ms
      averageTime: 50 // 50ms
    },
    kyberDecaps: {
      maxTime: 150,   // 150ms
      averageTime: 75 // 75ms
    },
    dilithiumSign: {
      maxTime: 200,    // 200ms
      averageTime: 100 // 100ms
    },
    dilithiumVerify: {
      maxTime: 50,    // 50ms
      averageTime: 25 // 25ms
    }
  }
};

module.exports = {
  generateTestKeys,
  sampleDevices,
  sampleAttestationReports,
  sampleUsers,
  sampleAPIResponses,
  cryptoTestVectors,
  performanceTestData
};
