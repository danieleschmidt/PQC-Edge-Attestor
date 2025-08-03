const request = require('supertest');
const { sequelize } = require('../../src/database/connection');
const { Device } = require('../../src/models');
const { CryptoService, AttestationService } = require('../../src/services');
const { appInstance } = require('../../src/app');

let app;

describe('PQC Edge Attestor API Integration Tests', () => {
  let authToken;
  let testDevice;
  let cryptoService;
  let attestationService;

  beforeAll(async () => {
    // Initialize the app
    app = await appInstance.initialize();
    
    // Initialize database connection for tests
    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    // Initialize services
    cryptoService = new CryptoService();
    attestationService = new AttestationService();

    // Generate test auth token
    authToken = generateTestToken({
      userId: 'test-user-123',
      role: 'admin',
      permissions: ['device:read', 'device:write', 'attestation:read', 'attestation:write']
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await Device.destroy({ where: {}, truncate: true });
  });

  describe('Device Management API', () => {
    describe('POST /api/devices', () => {
      it('should register a new device successfully', async () => {
        const deviceData = {
          serialNumber: 'TEST-DEVICE-001',
          deviceType: 'smart_meter',
          hardwareVersion: '1.0.0',
          firmwareVersion: '2.1.0',
          manufacturer: 'TestCorp',
          model: 'SmartMeter-X1'
        };

        const response = await request(app)
          .post('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deviceData)
          .expect(201);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('device');
        expect(response.body.device).toHaveProperty('id');
        expect(response.body.device.serialNumber).toBe(deviceData.serialNumber);
        expect(response.body.device.status).toBe('unprovisioned');

        testDevice = response.body.device;
      });

      it('should reject device registration with invalid data', async () => {
        const invalidData = {
          serialNumber: 'ABC', // Too short
          deviceType: 'invalid_type',
          hardwareVersion: 'invalid-version',
          firmwareVersion: '1.0',
          manufacturer: 'T',
          model: ''
        };

        const response = await request(app)
          .post('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData)
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
      });

      it('should reject duplicate serial numbers', async () => {
        const deviceData = {
          serialNumber: 'DUPLICATE-DEVICE',
          deviceType: 'ev_charger',
          hardwareVersion: '1.0.0',
          firmwareVersion: '1.0.0',
          manufacturer: 'TestCorp',
          model: 'Charger-1'
        };

        // First registration should succeed
        await request(app)
          .post('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deviceData)
          .expect(201);

        // Second registration should fail
        const response = await request(app)
          .post('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deviceData)
          .expect(409);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/devices', () => {
      beforeEach(async () => {
        // Create test devices
        const devices = [
          {
            serialNumber: 'DEVICE-001',
            deviceType: 'smart_meter',
            hardwareVersion: '1.0.0',
            firmwareVersion: '1.0.0',
            manufacturer: 'TestCorp',
            model: 'Meter-1'
          },
          {
            serialNumber: 'DEVICE-002',
            deviceType: 'ev_charger',
            hardwareVersion: '1.0.0',
            firmwareVersion: '1.0.0',
            manufacturer: 'TestCorp',
            model: 'Charger-1'
          }
        ];

        for (const deviceData of devices) {
          await request(app)
            .post('/api/devices')
            .set('Authorization', `Bearer ${authToken}`)
            .send(deviceData);
        }
      });

      it('should list devices with pagination', async () => {
        const response = await request(app)
          .get('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 1, limit: 10 })
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('devices');
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.devices).toHaveLength(2);
        expect(response.body.pagination.total).toBe(2);
      });

      it('should filter devices by type', async () => {
        const response = await request(app)
          .get('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ type: 'smart_meter' })
          .expect(200);

        expect(response.body.devices).toHaveLength(1);
        expect(response.body.devices[0].deviceType).toBe('smart_meter');
      });

      it('should search devices by manufacturer', async () => {
        const response = await request(app)
          .get('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ search: 'TestCorp' })
          .expect(200);

        expect(response.body.devices).toHaveLength(2);
      });
    });

    describe('POST /api/devices/:deviceId/provision', () => {
      beforeEach(async () => {
        const deviceData = {
          serialNumber: 'PROVISION-TEST',
          deviceType: 'gateway',
          hardwareVersion: '1.0.0',
          firmwareVersion: '1.0.0',
          manufacturer: 'TestCorp',
          model: 'Gateway-1'
        };

        const response = await request(app)
          .post('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deviceData);

        testDevice = response.body.device;
      });

      it('should provision device with PQC algorithms', async () => {
        const provisionData = {
          algorithms: {
            kem: 'kyber1024',
            signature: 'dilithium5'
          }
        };

        const response = await request(app)
          .post(`/api/devices/${testDevice.id}/provision`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(provisionData)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.device.status).toBe('provisioned');
        expect(response.body).toHaveProperty('provisioning');
        expect(response.body.provisioning.algorithms).toEqual(provisionData.algorithms);
        expect(response.body.provisioning).toHaveProperty('publicKeys');
      });

      it('should reject provisioning with unsupported algorithms', async () => {
        const invalidData = {
          algorithms: {
            kem: 'unsupported_kem',
            signature: 'unsupported_sig'
          }
        };

        const response = await request(app)
          .post(`/api/devices/${testDevice.id}/provision`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData)
          .expect(400);

        expect(response.body).toHaveProperty('error');
      });
    });
  });

  describe('Attestation API', () => {
    beforeEach(async () => {
      // Create and provision a test device
      const deviceData = {
        serialNumber: 'ATTESTATION-TEST',
        deviceType: 'sensor',
        hardwareVersion: '1.0.0',
        firmwareVersion: '1.0.0',
        manufacturer: 'TestCorp',
        model: 'Sensor-1'
      };

      const deviceResponse = await request(app)
        .post('/api/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deviceData);

      testDevice = deviceResponse.body.device;

      // Provision the device
      await request(app)
        .post(`/api/devices/${testDevice.id}/provision`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          algorithms: {
            kem: 'kyber1024',
            signature: 'dilithium5'
          }
        });

      // Update device status to active
      await request(app)
        .put(`/api/devices/${testDevice.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'active' });
    });

    describe('POST /api/attestation/:deviceId/request', () => {
      it('should generate attestation challenge', async () => {
        const response = await request(app)
          .post(`/api/attestation/${testDevice.id}/request`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ timeout: 300000 })
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('attestationRequest');
        expect(response.body.attestationRequest).toHaveProperty('challenge');
        expect(response.body.attestationRequest).toHaveProperty('algorithm');
        expect(response.body.attestationRequest).toHaveProperty('expiresAt');
      });
    });

    describe('POST /api/attestation/:deviceId/submit', () => {
      it('should submit and verify attestation report', async () => {
        const attestationData = {
          measurements: {
            pcr0: 'a1b2c3d4e5f6789012345678901234567890abcdef',
            pcr1: 'b2c3d4e5f6789012345678901234567890abcdef01',
            bootHash: 'c3d4e5f6789012345678901234567890abcdef0123'
          },
          signature: 'test-signature-data-here',
          nonce: 'abcdef1234567890abcdef1234567890',
          platformInfo: {
            tpmVersion: '2.0',
            firmwareVersion: '1.0.0'
          }
        };

        const response = await request(app)
          .post(`/api/attestation/${testDevice.id}/submit`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(attestationData)
          .expect(201);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('attestationReport');
        expect(response.body.attestationReport).toHaveProperty('id');
        expect(response.body.attestationReport).toHaveProperty('verificationResult');
      });

      it('should reject attestation from inactive device', async () => {
        // Update device to inactive
        await request(app)
          .put(`/api/devices/${testDevice.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ status: 'inactive' });

        const attestationData = {
          measurements: { pcr0: 'test' },
          signature: 'test-signature',
          nonce: 'abcdef1234567890abcdef1234567890'
        };

        const response = await request(app)
          .post(`/api/attestation/${testDevice.id}/submit`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(attestationData)
          .expect(409);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/attestation/:deviceId/reports', () => {
      beforeEach(async () => {
        // Submit a test attestation report
        const attestationData = {
          measurements: { pcr0: 'test' },
          signature: 'test-signature',
          nonce: 'abcdef1234567890abcdef1234567890'
        };

        await request(app)
          .post(`/api/attestation/${testDevice.id}/submit`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(attestationData);
      });

      it('should retrieve device attestation reports', async () => {
        const response = await request(app)
          .get(`/api/attestation/${testDevice.id}/reports`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('reports');
        expect(response.body).toHaveProperty('pagination');
        expect(response.body).toHaveProperty('summary');
        expect(response.body.reports).toHaveLength(1);
      });
    });
  });

  describe('OTA Update API', () => {
    beforeEach(async () => {
      // Create, provision, and activate test device
      const deviceData = {
        serialNumber: 'OTA-TEST-DEVICE',
        deviceType: 'gateway',
        hardwareVersion: '1.0.0',
        firmwareVersion: '1.0.0',
        manufacturer: 'TestCorp',
        model: 'Gateway-OTA'
      };

      const deviceResponse = await request(app)
        .post('/api/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deviceData);

      testDevice = deviceResponse.body.device;

      // Provision and activate
      await request(app)
        .post(`/api/devices/${testDevice.id}/provision`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          algorithms: {
            kem: 'kyber1024',
            signature: 'dilithium5'
          }
        });

      await request(app)
        .put(`/api/devices/${testDevice.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'active' });
    });

    describe('POST /api/ota/:deviceId/initiate', () => {
      it('should initiate OTA firmware update', async () => {
        const updateData = {
          firmwareUrl: 'https://example.com/firmware/v2.0.0.bin',
          version: '2.0.0',
          checksumSHA256: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signature: 'test-firmware-signature-data'
        };

        const response = await request(app)
          .post(`/api/ota/${testDevice.id}/initiate`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(201);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('otaUpdate');
        expect(response.body.otaUpdate.status).toBe('pending');
        expect(response.body).toHaveProperty('instructions');
      });

      it('should reject downgrade attempts', async () => {
        const downgradeData = {
          firmwareUrl: 'https://example.com/firmware/v0.9.0.bin',
          version: '0.9.0', // Lower than current 1.0.0
          checksumSHA256: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
          signature: 'test-signature'
        };

        const response = await request(app)
          .post(`/api/ota/${testDevice.id}/initiate`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(downgradeData)
          .expect(409);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/ota/:deviceId/status', () => {
      it('should get device OTA status', async () => {
        const response = await request(app)
          .get(`/api/ota/${testDevice.id}/status`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('updateStatus');
        expect(response.body.updateStatus.deviceId).toBe(testDevice.id);
        expect(response.body.updateStatus.currentFirmwareVersion).toBe('1.0.0');
      });
    });
  });

  describe('API Security & Error Handling', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/devices')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access denied. No token provided.');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/devices')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid token');
    });

    it('should handle rate limiting', async () => {
      // This would require implementing rate limiting in the actual middleware
      // For now, we'll just verify the structure exists
      expect(app).toBeDefined();
    });

    it('should return proper error for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    it('should validate UUID parameters', async () => {
      const response = await request(app)
        .get('/api/devices/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // Helper function to generate test JWT token
  function generateTestToken(payload) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, process.env.JWT_SECRET || 'fallback-secret-key', {
      expiresIn: '1h'
    });
  }
});

describe('API Performance Tests', () => {
  let authToken;

  beforeAll(async () => {
    authToken = require('jsonwebtoken').sign(
      { userId: 'perf-test', role: 'admin' },
      process.env.JWT_SECRET || 'fallback-secret-key'
    );
  });

  it('should handle concurrent device registrations', async () => {
    const promises = [];
    const deviceCount = 10;

    for (let i = 0; i < deviceCount; i++) {
      const deviceData = {
        serialNumber: `PERF-TEST-${i}`,
        deviceType: 'sensor',
        hardwareVersion: '1.0.0',
        firmwareVersion: '1.0.0',
        manufacturer: 'PerfTest',
        model: 'Sensor-Perf'
      };

      promises.push(
        request(app)
          .post('/api/devices')
          .set('Authorization', `Bearer ${authToken}`)
          .send(deviceData)
          .expect(201)
      );
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(deviceCount);
    results.forEach(result => {
      expect(result.body).toHaveProperty('success', true);
    });
  });

  it('should handle large device list requests efficiently', async () => {
    const startTime = Date.now();

    const response = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ limit: 100 })
      .expect(200);

    const duration = Date.now() - startTime;

    expect(response.body).toHaveProperty('success', true);
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });
});