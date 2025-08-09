/**
 * @file mlKemMlDsaService.test.js
 * @brief Unit tests for NIST FIPS 203/204 ML-KEM/ML-DSA service
 * 
 * Comprehensive test suite for ML-KEM/ML-DSA implementation including
 * performance benchmarking, compliance validation, and comparative analysis.
 */

const MLKemMLDsaService = require('../../../src/services/mlKemMlDsaService');
const crypto = require('crypto');

describe('MLKemMLDsaService', () => {
  let service;

  beforeEach(() => {
    service = new MLKemMLDsaService({
      enableAcceleration: true,
      strictCompliance: true,
      cacheResults: false // Disable caching for testing
    });
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('ML-KEM Operations', () => {
    describe('Key Generation', () => {
      test('should generate ML-KEM-512 keypair', async () => {
        const keyPair = await service.generateMLKemKeypair(512);
        
        expect(keyPair).toBeDefined();
        expect(keyPair.algorithm).toBe('ML-KEM');
        expect(keyPair.securityLevel).toBe(512);
        expect(keyPair.publicKey).toBeInstanceOf(Buffer);
        expect(keyPair.secretKey).toBeInstanceOf(Buffer);
        expect(keyPair.metadata.compliance).toBe('NIST FIPS 203');
        expect(keyPair.metadata.duration).toBeGreaterThan(0);
        
        // Verify key sizes match NIST FIPS 203 specifications
        expect(keyPair.publicKey.length).toBe(service.mlKemParams[512].publicKeyBytes);
        expect(keyPair.secretKey.length).toBe(service.mlKemParams[512].secretKeyBytes);
      });

      test('should generate ML-KEM-768 keypair', async () => {
        const keyPair = await service.generateMLKemKeypair(768);
        
        expect(keyPair.algorithm).toBe('ML-KEM');
        expect(keyPair.securityLevel).toBe(768);
        expect(keyPair.publicKey.length).toBe(service.mlKemParams[768].publicKeyBytes);
        expect(keyPair.secretKey.length).toBe(service.mlKemParams[768].secretKeyBytes);
      });

      test('should generate ML-KEM-1024 keypair', async () => {
        const keyPair = await service.generateMLKemKeypair(1024);
        
        expect(keyPair.algorithm).toBe('ML-KEM');
        expect(keyPair.securityLevel).toBe(1024);
        expect(keyPair.publicKey.length).toBe(service.mlKemParams[1024].publicKeyBytes);
        expect(keyPair.secretKey.length).toBe(service.mlKemParams[1024].secretKeyBytes);
      });

      test('should reject invalid security levels', async () => {
        await expect(service.generateMLKemKeypair(256)).rejects.toThrow();
        await expect(service.generateMLKemKeypair(2048)).rejects.toThrow();
      });

      test('should generate unique keypairs', async () => {
        const keyPair1 = await service.generateMLKemKeypair(1024);
        const keyPair2 = await service.generateMLKemKeypair(1024);
        
        expect(keyPair1.publicKey.equals(keyPair2.publicKey)).toBe(false);
        expect(keyPair1.secretKey.equals(keyPair2.secretKey)).toBe(false);
      });
    });

    describe('Encapsulation/Decapsulation', () => {
      test('should perform complete ML-KEM encapsulation/decapsulation cycle', async () => {
        const keyPair = await service.generateMLKemKeypair(1024);
        
        // Encapsulation
        const encapResult = await service.mlKemEncapsulate(keyPair.publicKey, 1024);
        expect(encapResult.algorithm).toBe('ML-KEM');
        expect(encapResult.securityLevel).toBe(1024);
        expect(encapResult.ciphertext).toBeInstanceOf(Buffer);
        expect(encapResult.sharedSecret).toBeInstanceOf(Buffer);
        expect(encapResult.metadata.compliance).toBe('NIST FIPS 203');
        
        // Decapsulation
        const decapResult = await service.mlKemDecapsulate(
          encapResult.ciphertext, 
          keyPair.secretKey, 
          1024
        );
        expect(decapResult.algorithm).toBe('ML-KEM');
        expect(decapResult.sharedSecret).toBeInstanceOf(Buffer);
        expect(decapResult.metadata.compliance).toBe('NIST FIPS 203');
        
        // Shared secrets should match
        expect(encapResult.sharedSecret.equals(decapResult.sharedSecret)).toBe(true);
      });

      test('should handle different security levels for encapsulation', async () => {
        for (const level of [512, 768, 1024]) {
          const keyPair = await service.generateMLKemKeypair(level);
          const encapResult = await service.mlKemEncapsulate(keyPair.publicKey, level);
          
          expect(encapResult.securityLevel).toBe(level);
          expect(encapResult.ciphertext.length).toBe(service.mlKemParams[level].ciphertextBytes);
        }
      });

      test('should produce different ciphertexts for same public key', async () => {
        const keyPair = await service.generateMLKemKeypair(1024);
        
        const encap1 = await service.mlKemEncapsulate(keyPair.publicKey, 1024);
        const encap2 = await service.mlKemEncapsulate(keyPair.publicKey, 1024);
        
        // Different ciphertexts due to randomness
        expect(encap1.ciphertext.equals(encap2.ciphertext)).toBe(false);
        // But different shared secrets as well (due to random message)
        expect(encap1.sharedSecret.equals(encap2.sharedSecret)).toBe(false);
      });
    });
  });

  describe('ML-DSA Operations', () => {
    describe('Key Generation', () => {
      test('should generate ML-DSA-44 keypair', async () => {
        const keyPair = await service.generateMLDsaKeypair(44);
        
        expect(keyPair.algorithm).toBe('ML-DSA');
        expect(keyPair.securityLevel).toBe(44);
        expect(keyPair.publicKey.length).toBe(service.mlDsaParams[44].publicKeyBytes);
        expect(keyPair.secretKey.length).toBe(service.mlDsaParams[44].secretKeyBytes);
        expect(keyPair.metadata.compliance).toBe('NIST FIPS 204');
      });

      test('should generate ML-DSA-65 keypair', async () => {
        const keyPair = await service.generateMLDsaKeypair(65);
        
        expect(keyPair.algorithm).toBe('ML-DSA');
        expect(keyPair.securityLevel).toBe(65);
        expect(keyPair.publicKey.length).toBe(service.mlDsaParams[65].publicKeyBytes);
        expect(keyPair.secretKey.length).toBe(service.mlDsaParams[65].secretKeyBytes);
      });

      test('should generate ML-DSA-87 keypair', async () => {
        const keyPair = await service.generateMLDsaKeypair(87);
        
        expect(keyPair.algorithm).toBe('ML-DSA');
        expect(keyPair.securityLevel).toBe(87);
        expect(keyPair.publicKey.length).toBe(service.mlDsaParams[87].publicKeyBytes);
        expect(keyPair.secretKey.length).toBe(service.mlDsaParams[87].secretKeyBytes);
      });

      test('should reject invalid ML-DSA security levels', async () => {
        await expect(service.generateMLDsaKeypair(22)).rejects.toThrow();
        await expect(service.generateMLDsaKeypair(100)).rejects.toThrow();
      });
    });

    describe('Signature Operations', () => {
      test('should perform complete ML-DSA signature/verification cycle', async () => {
        const keyPair = await service.generateMLDsaKeypair(87);
        const message = crypto.randomBytes(64);
        
        // Signature generation
        const signResult = await service.mlDsaSign(message, keyPair.secretKey, 87);
        expect(signResult.algorithm).toBe('ML-DSA');
        expect(signResult.securityLevel).toBe(87);
        expect(signResult.signature).toBeInstanceOf(Buffer);
        expect(signResult.metadata.compliance).toBe('NIST FIPS 204');
        
        // Signature verification
        const verifyResult = await service.mlDsaVerify(
          signResult.signature, 
          message, 
          keyPair.publicKey, 
          87
        );
        expect(verifyResult.algorithm).toBe('ML-DSA');
        expect(verifyResult.isValid).toBe(true);
        expect(verifyResult.metadata.compliance).toBe('NIST FIPS 204');
      });

      test('should produce different signatures for same message', async () => {
        const keyPair = await service.generateMLDsaKeypair(87);
        const message = crypto.randomBytes(32);
        
        const sign1 = await service.mlDsaSign(message, keyPair.secretKey, 87);
        const sign2 = await service.mlDsaSign(message, keyPair.secretKey, 87);
        
        // Different signatures due to randomness in signing
        expect(sign1.signature.equals(sign2.signature)).toBe(false);
        
        // Both should verify correctly
        const verify1 = await service.mlDsaVerify(sign1.signature, message, keyPair.publicKey, 87);
        const verify2 = await service.mlDsaVerify(sign2.signature, message, keyPair.publicKey, 87);
        
        expect(verify1.isValid).toBe(true);
        expect(verify2.isValid).toBe(true);
      });

      test('should reject signature with wrong message', async () => {
        const keyPair = await service.generateMLDsaKeypair(87);
        const message1 = crypto.randomBytes(32);
        const message2 = crypto.randomBytes(32);
        
        const signResult = await service.mlDsaSign(message1, keyPair.secretKey, 87);
        const verifyResult = await service.mlDsaVerify(
          signResult.signature, 
          message2, // Different message
          keyPair.publicKey, 
          87
        );
        
        expect(verifyResult.isValid).toBe(false);
      });

      test('should handle different message sizes', async () => {
        const keyPair = await service.generateMLDsaKeypair(87);
        
        for (const size of [16, 32, 64, 128, 256]) {
          const message = crypto.randomBytes(size);
          const signResult = await service.mlDsaSign(message, keyPair.secretKey, 87);
          const verifyResult = await service.mlDsaVerify(
            signResult.signature, 
            message, 
            keyPair.publicKey, 
            87
          );
          
          expect(verifyResult.isValid).toBe(true);
        }
      });
    });
  });

  describe('Performance Benchmarking', () => {
    test('should run comparative performance benchmark', async () => {
      const iterations = 10; // Small number for fast testing
      const results = await service.comparativePerformanceBenchmark(iterations);
      
      expect(results.timestamp).toBeDefined();
      expect(results.iterations).toBe(iterations);
      expect(results.algorithms).toBeDefined();
      expect(results.comparative).toBeDefined();
      expect(results.conclusions).toBeDefined();
      
      // Check ML-KEM results
      expect(results.algorithms['ml-kem-1024']).toBeDefined();
      expect(results.algorithms['ml-kem-1024'].keyGeneration).toBeDefined();
      expect(results.algorithms['ml-kem-1024'].encapsulation).toBeDefined();
      expect(results.algorithms['ml-kem-1024'].decapsulation).toBeDefined();
      
      // Check ML-DSA results
      expect(results.algorithms['ml-dsa-87']).toBeDefined();
      expect(results.algorithms['ml-dsa-87'].keyGeneration).toBeDefined();
      expect(results.algorithms['ml-dsa-87'].signing).toBeDefined();
      expect(results.algorithms['ml-dsa-87'].verification).toBeDefined();
      
      // Verify statistical measures
      for (const alg of Object.values(results.algorithms)) {
        expect(alg.keyGeneration.mean).toBeGreaterThan(0);
        expect(alg.keyGeneration.stdDev).toBeGreaterThanOrEqual(0);
        expect(alg.memoryUsage.mean).toBeDefined();
      }
    });

    test('should track performance metrics', async () => {
      // Generate some operations to populate metrics
      await service.generateMLKemKeypair(1024);
      await service.generateMLDsaKeypair(87);
      
      expect(service.performanceMetrics.size).toBeGreaterThan(0);
    });
  });

  describe('NIST Compliance', () => {
    test('should use correct parameter sets for ML-KEM', () => {
      expect(service.mlKemParams[512]).toBeDefined();
      expect(service.mlKemParams[768]).toBeDefined();
      expect(service.mlKemParams[1024]).toBeDefined();
      
      // Verify NIST FIPS 203 parameter values
      expect(service.mlKemParams[1024].n).toBe(256);
      expect(service.mlKemParams[1024].k).toBe(4);
      expect(service.mlKemParams[1024].publicKeyBytes).toBe(1568);
      expect(service.mlKemParams[1024].secretKeyBytes).toBe(3168);
    });

    test('should use correct parameter sets for ML-DSA', () => {
      expect(service.mlDsaParams[44]).toBeDefined();
      expect(service.mlDsaParams[65]).toBeDefined();
      expect(service.mlDsaParams[87]).toBeDefined();
      
      // Verify NIST FIPS 204 parameter values
      expect(service.mlDsaParams[87].n).toBe(256);
      expect(service.mlDsaParams[87].q).toBe(8380417);
      expect(service.mlDsaParams[87].k).toBe(8);
      expect(service.mlDsaParams[87].l).toBe(7);
    });

    test('should enforce strict compliance mode', () => {
      const strictService = new MLKemMLDsaService({ strictCompliance: true });
      expect(strictService.options.strictCompliance).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid inputs gracefully', async () => {
      await expect(service.mlKemEncapsulate(Buffer.alloc(10), 1024)).rejects.toThrow();
      await expect(service.mlKemDecapsulate(Buffer.alloc(10), Buffer.alloc(10), 1024)).rejects.toThrow();
      await expect(service.mlDsaSign(Buffer.alloc(32), Buffer.alloc(10), 87)).rejects.toThrow();
    });

    test('should handle empty inputs', async () => {
      await expect(service.mlKemEncapsulate(Buffer.alloc(0), 1024)).rejects.toThrow();
      await expect(service.mlDsaSign(Buffer.alloc(0), Buffer.alloc(10), 87)).rejects.toThrow();
    });
  });

  describe('Security Properties', () => {
    test('should generate cryptographically secure random keys', async () => {
      const keyPairs = await Promise.all([
        service.generateMLKemKeypair(1024),
        service.generateMLKemKeypair(1024),
        service.generateMLKemKeypair(1024)
      ]);
      
      // All keys should be different
      for (let i = 0; i < keyPairs.length; i++) {
        for (let j = i + 1; j < keyPairs.length; j++) {
          expect(keyPairs[i].publicKey.equals(keyPairs[j].publicKey)).toBe(false);
          expect(keyPairs[i].secretKey.equals(keyPairs[j].secretKey)).toBe(false);
        }
      }
    });

    test('should produce non-deterministic signatures', async () => {
      const keyPair = await service.generateMLDsaKeypair(87);
      const message = crypto.randomBytes(32);
      
      const signatures = await Promise.all([
        service.mlDsaSign(message, keyPair.secretKey, 87),
        service.mlDsaSign(message, keyPair.secretKey, 87),
        service.mlDsaSign(message, keyPair.secretKey, 87)
      ]);
      
      // All signatures should be different due to randomness
      for (let i = 0; i < signatures.length; i++) {
        for (let j = i + 1; j < signatures.length; j++) {
          expect(signatures[i].signature.equals(signatures[j].signature)).toBe(false);
        }
      }
    });
  });

  describe('Memory Management', () => {
    test('should cleanup resources properly', async () => {
      const initialCacheSize = service.keyCache.size;
      const initialMetricsSize = service.performanceMetrics.size;
      
      // Generate some data to populate caches
      service.options.cacheResults = true;
      await service.generateMLKemKeypair(1024);
      await service.generateMLDsaKeypair(87);
      
      await service.cleanup();
      
      expect(service.keyCache.size).toBe(0);
      expect(service.performanceMetrics.size).toBe(0);
    });
  });
});