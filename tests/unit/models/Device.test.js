const { Device } = require('../../../src/models');
const { ValidationError } = require('../../../src/utils/validators');

describe('Device Model', () => {
  describe('constructor', () => {
    it('should create a valid device with required fields', () => {
      const deviceData = testUtils.createTestDevice();
      const device = new Device(deviceData);

      expect(device.serialNumber).toBe(deviceData.serialNumber);
      expect(device.deviceType).toBe(deviceData.deviceType);
      expect(device.hardwareVersion).toBe(deviceData.hardwareVersion);
      expect(device.firmwareVersion).toBe(deviceData.firmwareVersion);
      expect(device.manufacturer).toBe(deviceData.manufacturer);
      expect(device.model).toBe(deviceData.model);
      expect(device.status).toBe('unprovisioned');
      expect(device.createdAt).toBeInstanceOf(Date);
      expect(device.updatedAt).toBeInstanceOf(Date);
    });

    it('should generate a valid device ID', () => {
      const deviceData = testUtils.createTestDevice();
      deviceData.id = Device.generateDeviceId(deviceData.serialNumber, deviceData.manufacturer);
      
      const device = new Device(deviceData);
      expect(device.id).toBeValidHex(32);
    });

    it('should throw ValidationError for missing required fields', () => {
      expect(() => {
        new Device({});
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid device type', () => {
      const deviceData = testUtils.createTestDevice({
        deviceType: 'invalid_type'
      });

      expect(() => {
        new Device(deviceData);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid version format', () => {
      const deviceData = testUtils.createTestDevice({
        firmwareVersion: 'invalid.version'
      });

      expect(() => {
        new Device(deviceData);
      }).toThrow(ValidationError);
    });
  });

  describe('static methods', () => {
    describe('generateDeviceId', () => {
      it('should generate consistent IDs for same input', () => {
        const serialNumber = 'TEST123456';
        const manufacturer = 'TestCorp';
        
        const id1 = Device.generateDeviceId(serialNumber, manufacturer);
        const id2 = Device.generateDeviceId(serialNumber, manufacturer);
        
        expect(id1).toBe(id2);
        expect(id1).toBeValidHex(64);
      });

      it('should generate different IDs for different inputs', () => {
        const id1 = Device.generateDeviceId('SERIAL1', 'Manufacturer1');
        const id2 = Device.generateDeviceId('SERIAL2', 'Manufacturer2');
        
        expect(id1).not.toBe(id2);
      });
    });
  });

  describe('instance methods', () => {
    let device;

    beforeEach(() => {
      const deviceData = testUtils.createTestDevice();
      device = new Device(deviceData);
    });

    describe('updateFirmware', () => {
      it('should update firmware version with valid signature', () => {
        const newVersion = '2.2.0';
        const mockSignature = 'valid_signature';
        
        // Mock the signature verification
        jest.spyOn(device, 'verifyFirmwareSignature').mockReturnValue(true);
        
        const result = device.updateFirmware(newVersion, mockSignature);
        
        expect(result).toBe(true);
        expect(device.firmwareVersion).toBe(newVersion);
        expect(device.status).toBe('active');
        expect(device.updatedAt).toBeInstanceOf(Date);
      });

      it('should reject firmware update with invalid signature', () => {
        const newVersion = '2.2.0';
        const invalidSignature = 'invalid_signature';
        
        jest.spyOn(device, 'verifyFirmwareSignature').mockReturnValue(false);
        
        expect(() => {
          device.updateFirmware(newVersion, invalidSignature);
        }).toThrow('Invalid firmware signature');
      });
    });

    describe('verifyFirmwareSignature', () => {
      it('should return true for supported algorithms', () => {
        const supportedAlgorithms = ['dilithium5', 'falcon1024', 'hybrid'];
        
        supportedAlgorithms.forEach(algorithm => {
          const result = device.verifyFirmwareSignature('signature', algorithm);
          expect(result).toBe(true);
        });
      });

      it('should throw error for unsupported algorithms', () => {
        expect(() => {
          device.verifyFirmwareSignature('signature', 'unsupported');
        }).toThrow('Unsupported signature algorithm: unsupported');
      });
    });

    describe('setPQCAlgorithms', () => {
      it('should set valid PQC algorithms', () => {
        const algorithms = {
          kem: 'kyber1024',
          signature: 'dilithium5',
          hybrid: 'pqc_only'
        };
        
        device.setPQCAlgorithms(algorithms);
        
        expect(device.pqcAlgorithms).toEqual(expect.objectContaining(algorithms));
        expect(device.updatedAt).toBeInstanceOf(Date);
      });

      it('should reject invalid algorithm types', () => {
        const invalidAlgorithms = {
          kem: 'invalid_kem'
        };
        
        expect(() => {
          device.setPQCAlgorithms(invalidAlgorithms);
        }).toThrow('Invalid PQC algorithm: kem=invalid_kem');
      });
    });

    describe('setAttestationPolicy', () => {
      it('should set valid attestation policy', () => {
        const policy = {
          measurementInterval: 300,
          requiredMeasurements: ['firmware_hash', 'bootloader_hash'],
          failureThreshold: 3,
          alertEndpoints: ['https://alerts.example.com/webhook']
        };
        
        device.setAttestationPolicy(policy);
        
        expect(device.attestationPolicy).toEqual(policy);
        expect(device.updatedAt).toBeInstanceOf(Date);
      });

      it('should reject invalid policy parameters', () => {
        const invalidPolicy = {
          measurementInterval: 30 // Too short
        };
        
        expect(() => {
          device.setAttestationPolicy(invalidPolicy);
        }).toThrow(ValidationError);
      });
    });

    describe('recordAttestation', () => {
      it('should record successful attestation', () => {
        const attestationData = {
          reportHash: 'a'.repeat(64),
          measurements: {
            firmware_hash: 'f'.repeat(64),
            bootloader_hash: 'b'.repeat(64)
          },
          signature: 'signature',
          verificationResult: true
        };
        
        const result = device.recordAttestation(attestationData);
        
        expect(result).toEqual(expect.objectContaining({
          timestamp: expect.any(Date),
          reportHash: attestationData.reportHash,
          verificationResult: true,
          riskScore: expect.any(Number)
        }));
        
        expect(device.lastAttestation).toBe(result);
        expect(device.status).toBe('active');
      });

      it('should record failed attestation', () => {
        const attestationData = {
          reportHash: 'a'.repeat(64),
          measurements: {},
          signature: 'signature',
          verificationResult: false
        };
        
        const result = device.recordAttestation(attestationData);
        
        expect(result.verificationResult).toBe(false);
        expect(result.riskScore).toBeGreaterThan(0.5);
        expect(device.status).toBe('inactive');
      });
    });

    describe('calculateRiskScore', () => {
      it('should calculate low risk for valid attestation', () => {
        const attestationData = {
          verificationResult: true,
          measurements: {
            firmware_hash: device.expectedFirmwareHash
          },
          timestamp: new Date()
        };
        
        const riskScore = device.calculateRiskScore(attestationData);
        expect(riskScore).toBeLessThan(0.3);
      });

      it('should calculate high risk for failed verification', () => {
        const attestationData = {
          verificationResult: false,
          measurements: {},
          timestamp: new Date()
        };
        
        const riskScore = device.calculateRiskScore(attestationData);
        expect(riskScore).toBeGreaterThanOrEqual(0.5);
      });

      it('should increase risk for stale attestation', () => {
        const oldTimestamp = new Date(Date.now() - 400000); // 6+ minutes ago
        const attestationData = {
          verificationResult: true,
          measurements: {},
          timestamp: oldTimestamp
        };
        
        const riskScore = device.calculateRiskScore(attestationData);
        expect(riskScore).toBeGreaterThan(0.2);
      });
    });

    describe('isHealthy', () => {
      it('should return false for unprovisioned device', () => {
        expect(device.isHealthy()).toBe(false);
      });

      it('should return false for device without attestation', () => {
        device.status = 'active';
        expect(device.isHealthy()).toBe(false);
      });

      it('should return true for healthy device with recent attestation', () => {
        device.status = 'active';
        device.attestationPolicy = { measurementInterval: 300 };
        device.lastAttestation = {
          timestamp: new Date(),
          riskScore: 0.1
        };
        
        expect(device.isHealthy()).toBe(true);
      });

      it('should return false for device with stale attestation', () => {
        device.status = 'active';
        device.attestationPolicy = { measurementInterval: 300 };
        device.lastAttestation = {
          timestamp: new Date(Date.now() - 700000), // Too old
          riskScore: 0.1
        };
        
        expect(device.isHealthy()).toBe(false);
      });

      it('should return false for device with high risk score', () => {
        device.status = 'active';
        device.attestationPolicy = { measurementInterval: 300 };
        device.lastAttestation = {
          timestamp: new Date(),
          riskScore: 0.8 // High risk
        };
        
        expect(device.isHealthy()).toBe(false);
      });
    });

    describe('toJSON', () => {
      it('should return serializable object with all fields', () => {
        const json = device.toJSON();
        
        expect(json).toEqual(expect.objectContaining({
          id: device.id,
          serialNumber: device.serialNumber,
          deviceType: device.deviceType,
          status: device.status,
          isHealthy: expect.any(Boolean),
          createdAt: device.createdAt,
          updatedAt: device.updatedAt
        }));
        
        expect(JSON.stringify(json)).not.toThrow();
      });
    });

    describe('fromJSON', () => {
      it('should reconstruct device from JSON', () => {
        const originalJson = device.toJSON();
        const reconstructed = Device.fromJSON(originalJson);
        
        expect(reconstructed).toBeInstanceOf(Device);
        expect(reconstructed.id).toBe(device.id);
        expect(reconstructed.serialNumber).toBe(device.serialNumber);
        expect(reconstructed.deviceType).toBe(device.deviceType);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle device with minimal required data', () => {
      const minimalData = {
        id: 'a'.repeat(32),
        serialNumber: 'MIN12345',
        deviceType: 'sensor',
        hardwareVersion: '1.0.0',
        firmwareVersion: '1.0.0',
        manufacturer: 'MinCorp',
        model: 'MinSensor'
      };
      
      const device = new Device(minimalData);
      expect(device).toBeInstanceOf(Device);
      expect(device.status).toBe('unprovisioned');
      expect(device.pqcAlgorithms).toEqual({});
      expect(device.certificates).toEqual({});
    });

    it('should handle long serial numbers', () => {
      const longSerial = 'A'.repeat(64); // Maximum length
      const deviceData = testUtils.createTestDevice({
        serialNumber: longSerial
      });
      
      const device = new Device(deviceData);
      expect(device.serialNumber).toBe(longSerial);
    });

    it('should handle firmware version with suffix', () => {
      const versionWithSuffix = '2.1.0-beta1';
      const deviceData = testUtils.createTestDevice({
        firmwareVersion: versionWithSuffix
      });
      
      const device = new Device(deviceData);
      expect(device.firmwareVersion).toBe(versionWithSuffix);
    });
  });
});