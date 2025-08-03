/**
 * @file pqcService.test.js
 * @brief Unit tests for PQCService post-quantum cryptography operations
 * 
 * Comprehensive test suite covering Kyber key encapsulation, Dilithium signatures,
 * Falcon compact signatures, and hybrid cryptographic operations.
 */

const PQCService = require('../../../src/services/pqcService');
const crypto = require('crypto');

describe('PQCService', () => {
  let pqcService;
  
  beforeEach(() => {
    pqcService = new PQCService();
  });
  
  afterEach(() => {
    // Reset metrics after each test
    pqcService.resetMetrics();
  });

  describe('Kyber Key Encapsulation', () => {
    describe('generateKyberKeyPair', () => {
      it('should generate valid Kyber-1024 key pair', async () => {
        const keyPair = await pqcService.generateKyberKeyPair();
        
        expect(keyPair).toHaveProperty('publicKey');
        expect(keyPair).toHaveProperty('secretKey');
        expect(keyPair).toHaveProperty('algorithm', 'kyber-1024');
        expect(keyPair).toHaveProperty('securityLevel', 5);
        
        // Check key sizes
        expect(keyPair.publicKey).toBeInstanceOf(Buffer);
        expect(keyPair.secretKey).toBeInstanceOf(Buffer);
        expect(keyPair.publicKey.length).toBe(1568); // Kyber-1024 public key size
        expect(keyPair.secretKey.length).toBe(3168); // Kyber-1024 secret key size
      });
      
      it('should generate unique key pairs', async () => {
        const keyPair1 = await pqcService.generateKyberKeyPair();
        const keyPair2 = await pqcService.generateKyberKeyPair();
        
        expect(keyPair1.publicKey.equals(keyPair2.publicKey)).toBe(false);
        expect(keyPair1.secretKey.equals(keyPair2.secretKey)).toBe(false);
      });
      
      it('should update metrics on key generation', async () => {
        await pqcService.generateKyberKeyPair();
        
        const metrics = pqcService.getMetrics();
        expect(metrics.operations.kyber_keygen).toBe(1);
        expect(metrics.performance.kyber_keygen.totalOperations).toBe(1);
      });
    });

    describe('kyberEncapsulate', () => {
      let keyPair;
      
      beforeEach(async () => {
        keyPair = await pqcService.generateKyberKeyPair();
      });
      
      it('should encapsulate shared secret successfully', async () => {
        const result = await pqcService.kyberEncapsulate(keyPair.publicKey);
        
        expect(result).toHaveProperty('ciphertext');
        expect(result).toHaveProperty('sharedSecret');
        
        expect(result.ciphertext).toBeInstanceOf(Buffer);
        expect(result.sharedSecret).toBeInstanceOf(Buffer);
        expect(result.ciphertext.length).toBe(1568); // Kyber-1024 ciphertext size
        expect(result.sharedSecret.length).toBe(32); // Shared secret size
      });
      
      it('should generate different ciphertexts for same public key', async () => {
        const result1 = await pqcService.kyberEncapsulate(keyPair.publicKey);
        const result2 = await pqcService.kyberEncapsulate(keyPair.publicKey);
        
        expect(result1.ciphertext.equals(result2.ciphertext)).toBe(false);
        expect(result1.sharedSecret.equals(result2.sharedSecret)).toBe(false);
      });
      
      it('should throw error for invalid public key', async () => {
        const invalidKey = Buffer.alloc(100); // Wrong size
        
        await expect(pqcService.kyberEncapsulate(invalidKey))
          .rejects.toThrow('Invalid Kyber public key format or size');
      });
      
      it('should throw error for non-buffer input', async () => {
        await expect(pqcService.kyberEncapsulate('not-a-buffer'))
          .rejects.toThrow('Invalid Kyber public key format or size');
      });
    });

    describe('kyberDecapsulate', () => {
      let keyPair;
      let encapsulationResult;
      
      beforeEach(async () => {
        keyPair = await pqcService.generateKyberKeyPair();
        encapsulationResult = await pqcService.kyberEncapsulate(keyPair.publicKey);
      });
      
      it('should decapsulate shared secret correctly', async () => {
        const result = await pqcService.kyberDecapsulate(
          encapsulationResult.ciphertext,
          keyPair.secretKey
        );
        
        expect(result).toHaveProperty('sharedSecret');
        expect(result.sharedSecret).toBeInstanceOf(Buffer);
        expect(result.sharedSecret.length).toBe(32);
        
        // Verify shared secrets match
        expect(result.sharedSecret.equals(encapsulationResult.sharedSecret)).toBe(true);
      });
      
      it('should throw error for invalid ciphertext', async () => {
        const invalidCiphertext = Buffer.alloc(100);
        
        await expect(pqcService.kyberDecapsulate(invalidCiphertext, keyPair.secretKey))
          .rejects.toThrow('Invalid Kyber ciphertext format or size');
      });
      
      it('should throw error for invalid secret key', async () => {
        const invalidSecretKey = Buffer.alloc(100);
        
        await expect(pqcService.kyberDecapsulate(
          encapsulationResult.ciphertext,
          invalidSecretKey
        )).rejects.toThrow('Invalid Kyber secret key format or size');
      });
    });
  });

  describe('Dilithium Digital Signatures', () => {
    describe('generateDilithiumKeyPair', () => {
      it('should generate valid Dilithium-5 key pair', async () => {
        const keyPair = await pqcService.generateDilithiumKeyPair();
        
        expect(keyPair).toHaveProperty('publicKey');
        expect(keyPair).toHaveProperty('secretKey');
        expect(keyPair).toHaveProperty('algorithm', 'dilithium-5');
        expect(keyPair).toHaveProperty('securityLevel', 5);
        
        expect(keyPair.publicKey).toBeInstanceOf(Buffer);
        expect(keyPair.secretKey).toBeInstanceOf(Buffer);
        expect(keyPair.publicKey.length).toBe(2592); // Dilithium-5 public key size
        expect(keyPair.secretKey.length).toBe(4864); // Dilithium-5 secret key size
      });
    });

    describe('dilithiumSign', () => {
      let keyPair;
      const testMessage = Buffer.from('Test message for Dilithium signing', 'utf8');
      
      beforeEach(async () => {
        keyPair = await pqcService.generateDilithiumKeyPair();
      });
      
      it('should create valid signature', async () => {
        const result = await pqcService.dilithiumSign(testMessage, keyPair.secretKey);
        
        expect(result).toHaveProperty('signature');
        expect(result).toHaveProperty('algorithm', 'dilithium-5');
        
        expect(result.signature).toBeInstanceOf(Buffer);
        expect(result.signature.length).toBe(4595); // Dilithium-5 signature size
      });
      
      it('should create different signatures for same message', async () => {
        const result1 = await pqcService.dilithiumSign(testMessage, keyPair.secretKey);
        const result2 = await pqcService.dilithiumSign(testMessage, keyPair.secretKey);
        
        // Signatures should be different due to randomness
        expect(result1.signature.equals(result2.signature)).toBe(false);
      });
      
      it('should throw error for empty message', async () => {
        const emptyMessage = Buffer.alloc(0);
        
        await expect(pqcService.dilithiumSign(emptyMessage, keyPair.secretKey))
          .rejects.toThrow('Invalid message format or empty message');
      });
      
      it('should throw error for invalid secret key', async () => {
        const invalidSecretKey = Buffer.alloc(100);
        
        await expect(pqcService.dilithiumSign(testMessage, invalidSecretKey))
          .rejects.toThrow('Invalid Dilithium secret key format or size');
      });
    });

    describe('dilithiumVerify', () => {
      let keyPair;
      let signature;
      const testMessage = Buffer.from('Test message for Dilithium verification', 'utf8');
      
      beforeEach(async () => {
        keyPair = await pqcService.generateDilithiumKeyPair();
        const signResult = await pqcService.dilithiumSign(testMessage, keyPair.secretKey);
        signature = signResult.signature;
      });
      
      it('should verify valid signature', async () => {
        const result = await pqcService.dilithiumVerify(
          signature,
          testMessage,
          keyPair.publicKey
        );
        
        expect(result).toHaveProperty('valid', true);
      });
      
      it('should reject invalid signature', async () => {
        const invalidSignature = Buffer.alloc(4595); // Wrong signature
        
        const result = await pqcService.dilithiumVerify(
          invalidSignature,
          testMessage,
          keyPair.publicKey
        );
        
        expect(result).toHaveProperty('valid', false);
      });
      
      it('should reject signature with wrong message', async () => {
        const wrongMessage = Buffer.from('Different message', 'utf8');
        
        const result = await pqcService.dilithiumVerify(
          signature,
          wrongMessage,
          keyPair.publicKey
        );
        
        expect(result).toHaveProperty('valid', false);
      });
      
      it('should reject signature with wrong public key', async () => {
        const wrongKeyPair = await pqcService.generateDilithiumKeyPair();
        
        const result = await pqcService.dilithiumVerify(
          signature,
          testMessage,
          wrongKeyPair.publicKey
        );
        
        expect(result).toHaveProperty('valid', false);
      });
    });
  });

  describe('Falcon Compact Signatures', () => {
    describe('generateFalconKeyPair', () => {
      it('should generate valid Falcon-1024 key pair', async () => {
        const keyPair = await pqcService.generateFalconKeyPair();
        
        expect(keyPair).toHaveProperty('publicKey');
        expect(keyPair).toHaveProperty('secretKey');
        expect(keyPair).toHaveProperty('algorithm', 'falcon-1024');
        expect(keyPair).toHaveProperty('securityLevel', 5);
        
        expect(keyPair.publicKey).toBeInstanceOf(Buffer);
        expect(keyPair.secretKey).toBeInstanceOf(Buffer);
        expect(keyPair.publicKey.length).toBe(1793); // Falcon-1024 public key size
        expect(keyPair.secretKey.length).toBe(2305); // Falcon-1024 secret key size
      });
    });

    describe('falconSign and falconVerify', () => {
      let keyPair;
      const testMessage = Buffer.from('Test message for Falcon signing', 'utf8');
      
      beforeEach(async () => {
        keyPair = await pqcService.generateFalconKeyPair();
      });
      
      it('should create and verify signature correctly', async () => {
        const signResult = await pqcService.falconSign(testMessage, keyPair.secretKey);
        
        expect(signResult).toHaveProperty('signature');
        expect(signResult).toHaveProperty('algorithm', 'falcon-1024');
        expect(signResult.signature).toBeInstanceOf(Buffer);
        expect(signResult.signature.length).toBe(1330); // Falcon-1024 signature size
        
        const verifyResult = await pqcService.falconVerify(
          signResult.signature,
          testMessage,
          keyPair.publicKey
        );
        
        expect(verifyResult).toHaveProperty('valid', true);
      });
    });
  });

  describe('Hybrid Cryptography', () => {
    describe('generateHybridKeyPair', () => {
      it('should generate hybrid Dilithium key pair', async () => {
        const keyPair = await pqcService.generateHybridKeyPair('dilithium');
        
        expect(keyPair).toHaveProperty('classical');
        expect(keyPair).toHaveProperty('postQuantum');
        expect(keyPair).toHaveProperty('hybrid', true);
        
        expect(keyPair.classical).toHaveProperty('algorithm', 'ECDSA-P384');
        expect(keyPair.postQuantum).toHaveProperty('algorithm', 'dilithium-5');
        
        expect(keyPair.classical.publicKey).toBeInstanceOf(Buffer);
        expect(keyPair.classical.privateKey).toBeInstanceOf(Buffer);
        expect(keyPair.postQuantum.publicKey).toBeInstanceOf(Buffer);
        expect(keyPair.postQuantum.secretKey).toBeInstanceOf(Buffer);
      });
      
      it('should generate hybrid Kyber key pair', async () => {
        const keyPair = await pqcService.generateHybridKeyPair('kyber');
        
        expect(keyPair.postQuantum).toHaveProperty('algorithm', 'kyber-1024');
      });
      
      it('should generate hybrid Falcon key pair', async () => {
        const keyPair = await pqcService.generateHybridKeyPair('falcon');
        
        expect(keyPair.postQuantum).toHaveProperty('algorithm', 'falcon-1024');
      });
      
      it('should throw error for unsupported algorithm', async () => {
        await expect(pqcService.generateHybridKeyPair('unsupported'))
          .rejects.toThrow('Unsupported PQC algorithm: unsupported');
      });
    });
  });

  describe('Performance Metrics', () => {
    it('should track operation metrics correctly', async () => {
      // Perform various operations
      await pqcService.generateKyberKeyPair();
      await pqcService.generateDilithiumKeyPair();
      await pqcService.generateFalconKeyPair();
      
      const metrics = pqcService.getMetrics();
      
      expect(metrics.operations.kyber_keygen).toBe(1);
      expect(metrics.operations.dilithium_keygen).toBe(1);
      expect(metrics.operations.falcon_keygen).toBe(1);
      
      expect(metrics.performance.kyber_keygen.averageLatency).toBeGreaterThan(0);
      expect(metrics.performance.dilithium_keygen.averageLatency).toBeGreaterThan(0);
      expect(metrics.performance.falcon_keygen.averageLatency).toBeGreaterThan(0);
    });
    
    it('should reset metrics correctly', async () => {
      await pqcService.generateKyberKeyPair();
      
      let metrics = pqcService.getMetrics();
      expect(metrics.operations.kyber_keygen).toBe(1);
      
      pqcService.resetMetrics();
      
      metrics = pqcService.getMetrics();
      expect(Object.keys(metrics.operations)).toHaveLength(0);
      expect(Object.keys(metrics.errors)).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle and track errors properly', async () => {
      const invalidBuffer = 'not-a-buffer';
      
      try {
        await pqcService.kyberEncapsulate(invalidBuffer);
      } catch (error) {
        expect(error.message).toContain('Invalid Kyber public key');
      }
      
      const metrics = pqcService.getMetrics();
      expect(metrics.errors.kyber_encaps).toBe(1);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full Kyber KEM workflow', async () => {
      // Generate key pair
      const keyPair = await pqcService.generateKyberKeyPair();
      
      // Encapsulate
      const encapResult = await pqcService.kyberEncapsulate(keyPair.publicKey);
      
      // Decapsulate
      const decapResult = await pqcService.kyberDecapsulate(
        encapResult.ciphertext,
        keyPair.secretKey
      );
      
      // Verify shared secrets match
      expect(decapResult.sharedSecret.equals(encapResult.sharedSecret)).toBe(true);
    });
    
    it('should complete full Dilithium signature workflow', async () => {
      const message = Buffer.from('Integration test message', 'utf8');
      
      // Generate key pair
      const keyPair = await pqcService.generateDilithiumKeyPair();
      
      // Sign message
      const signResult = await pqcService.dilithiumSign(message, keyPair.secretKey);
      
      // Verify signature
      const verifyResult = await pqcService.dilithiumVerify(
        signResult.signature,
        message,
        keyPair.publicKey
      );
      
      expect(verifyResult.valid).toBe(true);
    });
  });
});
