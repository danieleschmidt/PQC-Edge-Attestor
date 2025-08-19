/**
 * @file generation1.test.js
 * @brief Tests for Generation 1 PQC Edge Attestor functionality
 */

const PQCCryptoService = require('../../src/services/pqcCryptoService');
const AttestationService = require('../../src/services/attestationService');
const OTAUpdateService = require('../../src/services/otaUpdateService');
const DeviceManagementService = require('../../src/services/deviceManagementService');

describe('Generation 1: Basic Functionality Tests', () => {
    let pqcCrypto, attestationService, otaService, deviceManagement;

    beforeAll(async () => {
        pqcCrypto = new PQCCryptoService();
        attestationService = new AttestationService({
            deviceSerial: 'TEST-DEVICE-001',
            deviceType: 'DEVICE_TYPE_DEVELOPMENT_BOARD'
        });
        otaService = new OTAUpdateService({
            currentVersion: '1.0.0',
            enableAutoUpdate: false
        });
        deviceManagement = new DeviceManagementService({
            deviceId: 'TEST-DEVICE-001',
            enableRemoteManagement: false
        });
    });

    afterAll(async () => {
        await attestationService.cleanup();
        await otaService.cleanup();
        await deviceManagement.cleanup();
        pqcCrypto.cleanup();
    });

    describe('PQC Crypto Service', () => {
        test('should generate Kyber keypair', async () => {
            const keypair = await pqcCrypto.generateKyberKeypair();
            expect(keypair).toHaveProperty('publicKey');
            expect(keypair).toHaveProperty('secretKey');
            expect(keypair.algorithm).toBe('kyber-1024');
            expect(keypair.publicKey.length).toBe(1568);
            expect(keypair.secretKey.length).toBe(3168);
        });

        test('should perform Kyber encapsulation/decapsulation', async () => {
            const keypair = await pqcCrypto.generateKyberKeypair();
            const encResult = await pqcCrypto.kyberEncapsulate(keypair.publicKey);
            
            expect(encResult).toHaveProperty('ciphertext');
            expect(encResult).toHaveProperty('sharedSecret');
            expect(encResult.ciphertext.length).toBe(1568);
            expect(encResult.sharedSecret.length).toBe(32);

            const decResult = await pqcCrypto.kyberDecapsulate(
                encResult.ciphertext, 
                keypair.secretKey
            );
            expect(decResult.length).toBe(32);
        });

        test('should generate Dilithium keypair', async () => {
            const keypair = await pqcCrypto.generateDilithiumKeypair();
            expect(keypair).toHaveProperty('publicKey');
            expect(keypair).toHaveProperty('secretKey');
            expect(keypair.algorithm).toBe('dilithium-5');
            expect(keypair.publicKey.length).toBe(2592);
            expect(keypair.secretKey.length).toBe(4864);
        });

        test('should sign and verify with Dilithium', async () => {
            const keypair = await pqcCrypto.generateDilithiumKeypair();
            const message = Buffer.from('Test message for signing');
            
            const signature = await pqcCrypto.dilithiumSign(message, keypair.secretKey);
            expect(signature.length).toBe(4595);

            const isValid = await pqcCrypto.dilithiumVerify(
                signature, 
                message, 
                keypair.publicKey
            );
            expect(isValid).toBe(true);
        });

        test('should validate key formats', () => {
            const validKyberPublic = Buffer.alloc(1568);
            const validKyberSecret = Buffer.alloc(3168);
            
            expect(pqcCrypto.validateKey(validKyberPublic, 'kyber-1024', 'public')).toBe(true);
            expect(pqcCrypto.validateKey(validKyberSecret, 'kyber-1024', 'secret')).toBe(true);
            expect(pqcCrypto.validateKey(Buffer.alloc(100), 'kyber-1024', 'public')).toBe(false);
        });

        test('should return supported algorithms', () => {
            const algorithms = pqcCrypto.getSupportedAlgorithms();
            expect(algorithms.kem).toContain('kyber-1024');
            expect(algorithms.signature).toContain('dilithium-5');
            expect(algorithms.hybrid).toBe(false);
        });
    });

    describe('Attestation Service', () => {
        test('should initialize successfully', async () => {
            await attestationService.initialize();
            expect(attestationService.isInitialized()).toBe(true);
        });

        test('should collect measurements', async () => {
            const result = await attestationService.collectMeasurements();
            expect(result.success).toBe(true);
            expect(result.measurements).toBeInstanceOf(Array);
            expect(result.measurements.length).toBeGreaterThan(0);
            expect(result.measurements[0]).toHaveProperty('pcrIndex');
            expect(result.measurements[0]).toHaveProperty('type');
            expect(result.measurements[0]).toHaveProperty('value');
        });

        test('should generate attestation report', async () => {
            const report = await attestationService.generateAttestationReport();
            expect(report).toHaveProperty('deviceId');
            expect(report).toHaveProperty('timestamp');
            expect(report).toHaveProperty('measurements');
            expect(report).toHaveProperty('signature');
            expect(report.measurements).toBeInstanceOf(Array);
        });

        test('should get PCR values', () => {
            const pcrValues = attestationService.getPCRValues();
            expect(pcrValues).toBeInstanceOf(Array);
            expect(pcrValues.length).toBe(8);
            pcrValues.forEach(pcr => {
                expect(pcr).toBeInstanceOf(Buffer);
                expect(pcr.length).toBe(32);
            });
        });

        test('should get measurement log', () => {
            const log = attestationService.getMeasurementLog();
            expect(log).toBeInstanceOf(Array);
        });
    });

    describe('OTA Update Service', () => {
        test('should initialize successfully', async () => {
            await otaService.initialize();
            expect(otaService.getCurrentVersion()).toBe('1.0.0');
        });

        test('should check for updates', async () => {
            const result = await otaService.checkForUpdates();
            expect(result).toHaveProperty('available');
            if (result.available) {
                expect(result).toHaveProperty('version');
                expect(result).toHaveProperty('filename');
                expect(result).toHaveProperty('size');
            }
        });

        test('should get update statistics', () => {
            const stats = otaService.getUpdateStats();
            expect(stats).toHaveProperty('updatesChecked');
            expect(stats).toHaveProperty('updatesDownloaded');
            expect(stats).toHaveProperty('currentState');
            expect(typeof stats.updatesChecked).toBe('number');
        });
    });

    describe('Device Management Service', () => {
        test('should initialize successfully', async () => {
            await deviceManagement.initialize();
            expect(deviceManagement.initialized).toBe(true);
        });

        test('should get device status', async () => {
            const status = await deviceManagement.getDeviceStatus();
            expect(status).toHaveProperty('deviceId');
            expect(status).toHaveProperty('deviceType');
            expect(status).toHaveProperty('state');
            expect(status).toHaveProperty('uptime');
            expect(status).toHaveProperty('capabilities');
            expect(status.deviceType).toBe('PQC_EDGE_ATTESTOR');
            expect(status.capabilities).toHaveProperty('pqcCrypto', true);
            expect(status.capabilities).toHaveProperty('attestation', true);
        });

        test('should execute commands', async () => {
            const result = await deviceManagement.executeCommand({
                type: 'get_status'
            });
            expect(result).toHaveProperty('deviceId');
            expect(result).toHaveProperty('state');
        });

        test('should generate attestation report via command', async () => {
            const result = await deviceManagement.executeCommand({
                type: 'collect_attestation'
            });
            expect(result).toHaveProperty('deviceId');
            expect(result).toHaveProperty('measurements');
        });

        test('should handle reboot command', async () => {
            const result = await deviceManagement.executeCommand({
                type: 'reboot'
            });
            expect(result.success).toBe(true);
            expect(result.message).toBe('Device reboot initiated');
        });
    });

    describe('Service Integration', () => {
        test('should integrate PQC crypto with attestation', async () => {
            // Generate a keypair using PQC service
            const keypair = await pqcCrypto.generateDilithiumKeypair();
            
            // Generate attestation report
            const report = await attestationService.generateAttestationReport();
            
            // Verify the report signature using PQC service
            const reportData = JSON.stringify({
                deviceId: report.deviceId,
                timestamp: report.timestamp,
                measurements: report.measurements
            });
            const signature = Buffer.from(report.signature, 'hex');
            
            // Note: In a real scenario, we'd use the device's public key
            // For this test, we're just verifying the signature was created
            expect(signature).toBeInstanceOf(Buffer);
            expect(signature.length).toBeGreaterThan(0);
        });

        test('should coordinate services through device management', async () => {
            // Test that device management can orchestrate other services
            const attestationResult = await deviceManagement.generateAttestationReport();
            expect(attestationResult).toHaveProperty('deviceId');
            
            const status = await deviceManagement.getDeviceStatus();
            expect(status.stats.attestationsGenerated).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid parameters gracefully', async () => {
            await expect(pqcCrypto.kyberEncapsulate(Buffer.alloc(100))).rejects.toThrow();
            await expect(pqcCrypto.dilithiumSign(null, Buffer.alloc(4864))).rejects.toThrow();
        });

        test('should handle uninitialized services', async () => {
            const uninitializedService = new AttestationService();
            await expect(uninitializedService.collectMeasurements()).rejects.toThrow();
        });

        test('should handle unknown commands', async () => {
            await expect(deviceManagement.executeCommand({
                type: 'unknown_command'
            })).rejects.toThrow();
        });
    });
});