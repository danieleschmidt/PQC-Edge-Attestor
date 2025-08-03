const CryptoService = require('../../../src/services/CryptoService');

describe('CryptoService', () => {
  let cryptoService;

  beforeEach(() => {
    cryptoService = new CryptoService({
      defaultKemAlgorithm: 'kyber1024',
      defaultSignatureAlgorithm: 'dilithium5',
      hybridMode: true,
      securityLevel: 5
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const service = new CryptoService();
      expect(service.options.defaultKemAlgorithm).toBe('kyber1024');
      expect(service.options.defaultSignatureAlgorithm).toBe('dilithium5');
      expect(service.options.hybridMode).toBe(false);
    });

    it('should initialize with custom options', () => {
      const customOptions = {
        defaultKemAlgorithm: 'kyber768',
        defaultSignatureAlgorithm: 'dilithium3',
        hybridMode: true,
        securityLevel: 3
      };
      
      const service = new CryptoService(customOptions);
      expect(service.options.defaultKemAlgorithm).toBe('kyber768');
      expect(service.options.defaultSignatureAlgorithm).toBe('dilithium3');
      expect(service.options.hybridMode).toBe(true);
      expect(service.options.securityLevel).toBe(3);
    });
  });

  describe('KEM operations', () => {
    describe('generateKEMKeyPair', () => {
      it('should generate Kyber key pair with default algorithm', async () => {
        const keyPair = await cryptoService.generateKEMKeyPair();
        
        expect(keyPair).toEqual(expect.objectContaining({
          publicKey: expect.any(String),
          privateKey: expect.any(String),
          algorithm: 'kyber1024',
          keyLength: expect.objectContaining({
            public: expect.any(Number),
            private: expect.any(Number)
          })
        }));
        
        expect(keyPair.publicKey).toBeValidHex();
        expect(keyPair.privateKey).toBeValidHex();
      });

      it('should generate key pair with specified algorithm', async () => {
        const keyPair = await cryptoService.generateKEMKeyPair('kyber768');
        
        expect(keyPair.algorithm).toBe('kyber768');
        expect(keyPair.keyLength.public).toBeGreaterThan(0);
        expect(keyPair.keyLength.private).toBeGreaterThan(0);
      });

      it('should reject unsupported KEM algorithms', async () => {
        await expect(cryptoService.generateKEMKeyPair('invalid')).rejects.toThrow();
      });

      it('should cache key pairs when enabled', async () => {
        cryptoService.options.keyCache = true;
        
        const keyPair1 = await cryptoService.generateKEMKeyPair();
        const keyPair2 = await cryptoService.generateKEMKeyPair();
        
        // Keys should be different (new generation each time)
        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        
        // But cache should have entries
        const stats = cryptoService.getCacheStats();
        expect(stats.size).toBeGreaterThan(0);
      });
    });

    describe('encapsulate/decapsulate', () => {
      let keyPair;

      beforeEach(async () => {
        keyPair = await cryptoService.generateKEMKeyPair('kyber1024');
      });

      it('should encapsulate and decapsulate successfully', async () => {
        const encapResult = await cryptoService.encapsulate(keyPair.publicKey);
        
        expect(encapResult).toEqual(expect.objectContaining({
          ciphertext: expect.any(String),
          sharedSecret: expect.any(String),
          algorithm: 'kyber1024'
        }));
        
        const decapResult = await cryptoService.decapsulate(
          encapResult.ciphertext, 
          keyPair.privateKey
        );
        
        expect(decapResult).toBe(encapResult.sharedSecret);
      });

      it('should handle different algorithms', async () => {
        const kyber768KeyPair = await cryptoService.generateKEMKeyPair('kyber768');
        const encapResult = await cryptoService.encapsulate(
          kyber768KeyPair.publicKey, 
          'kyber768'
        );
        
        expect(encapResult.algorithm).toBe('kyber768');
        
        const decapResult = await cryptoService.decapsulate(
          encapResult.ciphertext,
          kyber768KeyPair.privateKey,
          'kyber768'
        );
        
        expect(decapResult).toBe(encapResult.sharedSecret);
      });

      it('should fail with wrong private key', async () => {
        const wrongKeyPair = await cryptoService.generateKEMKeyPair('kyber1024');
        const encapResult = await cryptoService.encapsulate(keyPair.publicKey);
        
        const decapResult = await cryptoService.decapsulate(
          encapResult.ciphertext,
          wrongKeyPair.privateKey
        );
        
        // Should get different shared secret (mock implementation)
        expect(decapResult).not.toBe(encapResult.sharedSecret);
      });
    });
  });

  describe('signature operations', () => {
    describe('generateSignatureKeyPair', () => {
      it('should generate Dilithium key pair with default algorithm', async () => {
        const keyPair = await cryptoService.generateSignatureKeyPair();
        
        expect(keyPair).toEqual(expect.objectContaining({
          publicKey: expect.any(String),
          privateKey: expect.any(String),
          algorithm: 'dilithium5',
          keyLength: expect.objectContaining({
            public: expect.any(Number),
            private: expect.any(Number)
          })
        }));
      });

      it('should generate Falcon key pair', async () => {
        const keyPair = await cryptoService.generateSignatureKeyPair('falcon1024');
        
        expect(keyPair.algorithm).toBe('falcon1024');
        expect(keyPair.publicKey).toBeValidHex();
        expect(keyPair.privateKey).toBeValidHex();
      });

      it('should reject unsupported signature algorithms', async () => {
        await expect(cryptoService.generateSignatureKeyPair('invalid')).rejects.toThrow();
      });
    });

    describe('sign/verify', () => {
      let keyPair;
      const message = 'test message for signing';

      beforeEach(async () => {
        keyPair = await cryptoService.generateSignatureKeyPair('dilithium5');
      });

      it('should sign and verify message successfully', async () => {
        const signature = await cryptoService.sign(message, keyPair.privateKey);
        
        expect(signature).toEqual(expect.objectContaining({
          signature: expect.any(String),
          algorithm: 'dilithium5',
          messageHash: expect.any(String)
        }));
        
        const isValid = await cryptoService.verify(
          message, 
          signature, 
          keyPair.publicKey
        );
        
        expect(isValid).toBe(true);
      });

      it('should fail verification with wrong public key', async () => {
        const wrongKeyPair = await cryptoService.generateSignatureKeyPair('dilithium5');
        const signature = await cryptoService.sign(message, keyPair.privateKey);
        
        const isValid = await cryptoService.verify(
          message,
          signature,
          wrongKeyPair.publicKey
        );
        
        expect(isValid).toBe(false);
      });

      it('should fail verification with modified message', async () => {
        const signature = await cryptoService.sign(message, keyPair.privateKey);
        const modifiedMessage = message + ' modified';
        
        const isValid = await cryptoService.verify(
          modifiedMessage,
          signature,
          keyPair.publicKey
        );
        
        expect(isValid).toBe(false);
      });

      it('should handle different signature algorithms', async () => {
        const falconKeyPair = await cryptoService.generateSignatureKeyPair('falcon1024');
        const signature = await cryptoService.sign(
          message, 
          falconKeyPair.privateKey, 
          'falcon1024'
        );
        
        expect(signature.algorithm).toBe('falcon1024');
        
        const isValid = await cryptoService.verify(
          message,
          signature,
          falconKeyPair.publicKey,
          'falcon1024'
        );
        
        expect(isValid).toBe(true);
      });
    });
  });

  describe('hybrid operations', () => {
    describe('generateHybridKeyPair', () => {
      it('should generate hybrid key pair when hybrid mode enabled', async () => {
        const keyPair = await cryptoService.generateHybridKeyPair();
        
        expect(keyPair).toEqual(expect.objectContaining({
          publicKey: expect.objectContaining({
            classical: expect.any(String),
            pqc: expect.any(String),
            algorithm: expect.stringContaining('+')
          }),
          privateKey: expect.objectContaining({
            classical: expect.any(String),
            pqc: expect.any(String),
            algorithm: expect.stringContaining('+')
          })
        }));
      });

      it('should fail when hybrid mode disabled', async () => {
        cryptoService.options.hybridMode = false;
        
        await expect(cryptoService.generateHybridKeyPair()).rejects.toThrow('Hybrid mode not enabled');
      });

      it('should allow custom classical algorithm', async () => {
        const keyPair = await cryptoService.generateHybridKeyPair('ecdsa', 'dilithium3');
        
        expect(keyPair.publicKey.algorithm).toContain('ecdsa');
        expect(keyPair.publicKey.algorithm).toContain('dilithium3');
      });
    });

    describe('hybrid sign/verify', () => {
      let hybridKeyPair;
      const message = 'hybrid signature test message';

      beforeEach(async () => {
        hybridKeyPair = await cryptoService.generateHybridKeyPair();
      });

      it('should sign and verify with hybrid keys', async () => {
        const signature = await cryptoService.sign(message, hybridKeyPair.privateKey);
        
        expect(signature).toEqual(expect.objectContaining({
          classical: expect.any(String),
          pqc: expect.any(String),
          algorithm: expect.stringContaining('+')
        }));
        
        const isValid = await cryptoService.verify(
          message,
          signature,
          hybridKeyPair.publicKey
        );
        
        expect(isValid).toBe(true);
      });

      it('should fail if either signature component is invalid', async () => {
        const signature = await cryptoService.sign(message, hybridKeyPair.privateKey);
        
        // Corrupt classical signature
        signature.classical = signature.classical.slice(0, -10) + '0'.repeat(10);
        
        const isValid = await cryptoService.verify(
          message,
          signature,
          hybridKeyPair.publicKey
        );
        
        expect(isValid).toBe(false);
      });
    });
  });

  describe('utility methods', () => {
    describe('hash', () => {
      it('should hash data with SHA-256 by default', async () => {
        const data = 'test data for hashing';
        const hash = await cryptoService.hash(data);
        
        expect(hash).toBeValidHex(64); // SHA-256 produces 64 hex chars
      });

      it('should support different hash algorithms', async () => {
        const data = 'test data';
        const sha384Hash = await cryptoService.hash(data, 'sha384');
        const sha3Hash = await cryptoService.hash(data, 'sha3-256');
        
        expect(sha384Hash).toBeValidHex(96); // SHA-384 produces 96 hex chars
        expect(sha3Hash).toBeValidHex(64);   // SHA3-256 produces 64 hex chars
        expect(sha384Hash).not.toBe(sha3Hash);
      });

      it('should reject unsupported hash algorithms', async () => {
        await expect(cryptoService.hash('data', 'md5')).rejects.toThrow();
      });
    });

    describe('generateRandomBytes', () => {
      it('should generate random bytes of specified length', async () => {
        const bytes = await cryptoService.generateRandomBytes(32);
        
        expect(bytes).toBeInstanceOf(Buffer);
        expect(bytes.length).toBe(32);
      });

      it('should generate different bytes on each call', async () => {
        const bytes1 = await cryptoService.generateRandomBytes(16);
        const bytes2 = await cryptoService.generateRandomBytes(16);
        
        expect(bytes1).not.toEqual(bytes2);
      });
    });

    describe('getSupportedAlgorithms', () => {
      it('should return supported algorithms', () => {
        const algorithms = cryptoService.getSupportedAlgorithms();
        
        expect(algorithms).toEqual(expect.objectContaining({
          kem: expect.arrayContaining(['kyber768', 'kyber1024']),
          signature: expect.arrayContaining(['dilithium3', 'dilithium5', 'falcon512', 'falcon1024']),
          hash: expect.arrayContaining(['sha256', 'sha384', 'sha3-256'])
        }));
      });
    });

    describe('getSecurityLevel', () => {
      it('should return correct security levels', () => {
        expect(cryptoService.getSecurityLevel('kyber768')).toBe(3);
        expect(cryptoService.getSecurityLevel('kyber1024')).toBe(5);
        expect(cryptoService.getSecurityLevel('dilithium3')).toBe(3);
        expect(cryptoService.getSecurityLevel('dilithium5')).toBe(5);
        expect(cryptoService.getSecurityLevel('unknown')).toBe(1);
      });
    });
  });

  describe('cache management', () => {
    beforeEach(() => {
      cryptoService.options.keyCache = true;
    });

    it('should cache key pairs when enabled', async () => {
      await cryptoService.generateKEMKeyPair();
      await cryptoService.generateSignatureKeyPair();
      
      const stats = cryptoService.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.entries.length).toBeGreaterThan(0);
    });

    it('should clear cache', () => {
      cryptoService.clearKeyCache();
      
      const stats = cryptoService.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should not cache when disabled', async () => {
      cryptoService.options.keyCache = false;
      
      await cryptoService.generateKEMKeyPair();
      
      const stats = cryptoService.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle crypto module initialization failure', () => {
      // Mock failed module loading
      const originalRequire = require;
      jest.doMock('../../../src/crypto/kyber/kyber', () => {
        throw new Error('Module not found');
      });
      
      expect(() => {
        new CryptoService();
      }).toThrow();
      
      // Restore require
      jest.dontMock('../../../src/crypto/kyber/kyber');
    });

    it('should handle invalid key formats gracefully', async () => {
      await expect(cryptoService.encapsulate('invalid_key')).rejects.toThrow();
      await expect(cryptoService.sign('message', 'invalid_key')).rejects.toThrow();
    });

    it('should handle large data efficiently', async () => {
      const largeData = 'x'.repeat(1000000); // 1MB of data
      
      const performance = await testUtils.measurePerformance(async () => {
        await cryptoService.hash(largeData);
      });
      
      expect(performance.averageTime).toBeLessThan(1000); // Should be fast
    });
  });

  describe('performance benchmarks', () => {
    it('should meet performance requirements for key generation', async () => {
      const kemPerf = await testUtils.measurePerformance(async () => {
        await cryptoService.generateKEMKeyPair('kyber1024');
      }, 5);
      
      const sigPerf = await testUtils.measurePerformance(async () => {
        await cryptoService.generateSignatureKeyPair('dilithium5');
      }, 5);
      
      // These are reasonable expectations for the mock implementation
      expect(kemPerf.averageTime).toBeLessThan(100);
      expect(sigPerf.averageTime).toBeLessThan(100);
    });

    it('should meet performance requirements for signature operations', async () => {
      const keyPair = await cryptoService.generateSignatureKeyPair('dilithium5');
      const message = 'performance test message';
      
      const signPerf = await testUtils.measurePerformance(async () => {
        await cryptoService.sign(message, keyPair.privateKey);
      }, 10);
      
      const signature = await cryptoService.sign(message, keyPair.privateKey);
      const verifyPerf = await testUtils.measurePerformance(async () => {
        await cryptoService.verify(message, signature, keyPair.publicKey);
      }, 10);
      
      expect(signPerf.averageTime).toBeLessThan(50);
      expect(verifyPerf.averageTime).toBeLessThan(50);
    });
  });
});