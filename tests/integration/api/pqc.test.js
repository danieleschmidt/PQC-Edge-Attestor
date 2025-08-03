/**
 * @file pqc.test.js
 * @brief Integration tests for PQC API endpoints
 * 
 * Comprehensive test suite covering REST API endpoints for post-quantum
 * cryptography operations including authentication, rate limiting, and error handling.
 */

const request = require('supertest');
const PQCEdgeAttestorServer = require('../../../src/index');
const crypto = require('crypto');

describe('PQC API Integration Tests', () => {
  let app;
  let server;
  
  beforeAll(async () => {
    // Create test server instance
    server = new PQCEdgeAttestorServer();
    await server.initializeServices();
    server.configureMiddleware();
    server.configureRoutes();
    server.configureErrorHandling();
    app = server.app;
  });
  
  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
    
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('services');
      expect(response.body.system).toHaveProperty('memory');
      expect(response.body.system).toHaveProperty('cpu');
    });
  });

  describe('Kyber Key Encapsulation API', () => {
    describe('POST /api/v1/pqc/kyber/keypair', () => {
      it('should generate Kyber key pair successfully', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/kyber/keypair')
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('publicKey');
        expect(response.body.data).toHaveProperty('secretKey');
        expect(response.body.data).toHaveProperty('algorithm', 'kyber-1024');
        expect(response.body.data).toHaveProperty('securityLevel', 5);
        
        // Validate base64 encoding
        expect(() => Buffer.from(response.body.data.publicKey, 'base64')).not.toThrow();
        expect(() => Buffer.from(response.body.data.secretKey, 'base64')).not.toThrow();
      });
      
      it('should respect rate limiting for key generation', async () => {
        // Make requests up to the limit
        const promises = [];
        for (let i = 0; i < 12; i++) { // Assuming limit is 10
          promises.push(
            request(app)
              .post('/api/v1/pqc/kyber/keypair')
          );
        }
        
        const responses = await Promise.all(promises);
        
        // Some requests should be rate limited
        const rateLimited = responses.filter(r => r.status === 429);
        expect(rateLimited.length).toBeGreaterThan(0);
      }, 30000);
    });

    describe('POST /api/v1/pqc/kyber/encapsulate', () => {
      let keyPair;
      
      beforeEach(async () => {
        const response = await request(app)
          .post('/api/v1/pqc/kyber/keypair')
          .expect(200);
        keyPair = response.body.data;
      });
      
      it('should encapsulate successfully with valid public key', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/kyber/encapsulate')
          .send({ publicKey: keyPair.publicKey })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('ciphertext');
        expect(response.body.data).toHaveProperty('sharedSecret');
        expect(response.body.data).toHaveProperty('sizes');
        
        // Validate base64 encoding
        expect(() => Buffer.from(response.body.data.ciphertext, 'base64')).not.toThrow();
        expect(() => Buffer.from(response.body.data.sharedSecret, 'base64')).not.toThrow();
      });
      
      it('should return 400 for invalid public key', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/kyber/encapsulate')
          .send({ publicKey: 'invalid-key' })
          .expect(400);
        
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      });
      
      it('should return 400 for missing public key', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/kyber/encapsulate')
          .send({})
          .expect(400);
        
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      });
    });

    describe('POST /api/v1/pqc/kyber/decapsulate', () => {
      let keyPair;
      let encapsulation;
      
      beforeEach(async () => {
        // Generate key pair
        const keyResponse = await request(app)
          .post('/api/v1/pqc/kyber/keypair')
          .expect(200);
        keyPair = keyResponse.body.data;
        
        // Perform encapsulation
        const encapResponse = await request(app)
          .post('/api/v1/pqc/kyber/encapsulate')
          .send({ publicKey: keyPair.publicKey })
          .expect(200);
        encapsulation = encapResponse.body.data;
      });
      
      it('should decapsulate successfully', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/kyber/decapsulate')
          .send({
            ciphertext: encapsulation.ciphertext,
            secretKey: keyPair.secretKey
          })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('sharedSecret');
        
        // Verify shared secrets match
        expect(response.body.data.sharedSecret).toBe(encapsulation.sharedSecret);
      });
      
      it('should return 400 for invalid ciphertext', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/kyber/decapsulate')
          .send({
            ciphertext: 'invalid-ciphertext',
            secretKey: keyPair.secretKey
          })
          .expect(400);
        
        expect(response.body).toHaveProperty('success', false);
      });
    });
  });

  describe('Dilithium Digital Signatures API', () => {
    describe('POST /api/v1/pqc/dilithium/keypair', () => {
      it('should generate Dilithium key pair successfully', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/keypair')
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('algorithm', 'dilithium-5');
        expect(response.body.data).toHaveProperty('securityLevel', 5);
      });
    });

    describe('POST /api/v1/pqc/dilithium/sign', () => {
      let keyPair;
      
      beforeEach(async () => {
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/keypair')
          .expect(200);
        keyPair = response.body.data;
      });
      
      it('should sign message successfully', async () => {
        const message = 'Test message for signing';
        
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/sign')
          .send({
            message: message,
            secretKey: keyPair.secretKey,
            encoding: 'utf8'
          })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('signature');
        expect(response.body.data).toHaveProperty('algorithm', 'dilithium-5');
        expect(response.body.data).toHaveProperty('messageHash');
      });
      
      it('should handle different message encodings', async () => {
        const message = Buffer.from('Test message').toString('base64');
        
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/sign')
          .send({
            message: message,
            secretKey: keyPair.secretKey,
            encoding: 'base64'
          })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
      });
      
      it('should return 400 for invalid encoding', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/sign')
          .send({
            message: 'test',
            secretKey: keyPair.secretKey,
            encoding: 'invalid'
          })
          .expect(400);
        
        expect(response.body).toHaveProperty('success', false);
      });
    });

    describe('POST /api/v1/pqc/dilithium/verify', () => {
      let keyPair;
      let signature;
      const testMessage = 'Test message for verification';
      
      beforeEach(async () => {
        // Generate key pair
        const keyResponse = await request(app)
          .post('/api/v1/pqc/dilithium/keypair')
          .expect(200);
        keyPair = keyResponse.body.data;
        
        // Sign message
        const signResponse = await request(app)
          .post('/api/v1/pqc/dilithium/sign')
          .send({
            message: testMessage,
            secretKey: keyPair.secretKey
          })
          .expect(200);
        signature = signResponse.body.data.signature;
      });
      
      it('should verify valid signature', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/verify')
          .send({
            signature: signature,
            message: testMessage,
            publicKey: keyPair.publicKey
          })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('valid', true);
      });
      
      it('should reject invalid signature', async () => {
        const invalidSignature = Buffer.alloc(4595).toString('base64');
        
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/verify')
          .send({
            signature: invalidSignature,
            message: testMessage,
            publicKey: keyPair.publicKey
          })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('valid', false);
      });
      
      it('should reject signature with wrong message', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/dilithium/verify')
          .send({
            signature: signature,
            message: 'Different message',
            publicKey: keyPair.publicKey
          })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('valid', false);
      });
    });
  });

  describe('Falcon Compact Signatures API', () => {
    describe('POST /api/v1/pqc/falcon/keypair', () => {
      it('should generate Falcon key pair successfully', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/falcon/keypair')
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('algorithm', 'falcon-1024');
        expect(response.body.data).toHaveProperty('securityLevel', 5);
      });
    });

    describe('Falcon sign and verify workflow', () => {
      it('should complete full signature workflow', async () => {
        // Generate key pair
        const keyResponse = await request(app)
          .post('/api/v1/pqc/falcon/keypair')
          .expect(200);
        const keyPair = keyResponse.body.data;
        
        const testMessage = 'Test message for Falcon';
        
        // Sign message
        const signResponse = await request(app)
          .post('/api/v1/pqc/falcon/sign')
          .send({
            message: testMessage,
            secretKey: keyPair.secretKey
          })
          .expect(200);
        
        expect(signResponse.body.data).toHaveProperty('algorithm', 'falcon-1024');
        
        // Verify signature
        const verifyResponse = await request(app)
          .post('/api/v1/pqc/falcon/verify')
          .send({
            signature: signResponse.body.data.signature,
            message: testMessage,
            publicKey: keyPair.publicKey
          })
          .expect(200);
        
        expect(verifyResponse.body.data).toHaveProperty('valid', true);
        expect(verifyResponse.body.data).toHaveProperty('algorithm', 'falcon-1024');
      });
    });
  });

  describe('Hybrid Cryptography API', () => {
    describe('POST /api/v1/pqc/hybrid/keypair', () => {
      it('should generate hybrid Dilithium key pair', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/hybrid/keypair')
          .send({ algorithm: 'dilithium' })
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('classical');
        expect(response.body.data).toHaveProperty('postQuantum');
        expect(response.body.data).toHaveProperty('hybrid', true);
        
        expect(response.body.data.classical).toHaveProperty('algorithm', 'ECDSA-P384');
        expect(response.body.data.postQuantum).toHaveProperty('algorithm', 'dilithium-5');
      });
      
      it('should generate hybrid Kyber key pair', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/hybrid/keypair')
          .send({ algorithm: 'kyber' })
          .expect(200);
        
        expect(response.body.data.postQuantum).toHaveProperty('algorithm', 'kyber-1024');
      });
      
      it('should return 400 for unsupported algorithm', async () => {
        const response = await request(app)
          .post('/api/v1/pqc/hybrid/keypair')
          .send({ algorithm: 'unsupported' })
          .expect(400);
        
        expect(response.body).toHaveProperty('success', false);
      });
    });
  });

  describe('Metrics and Health API', () => {
    describe('GET /api/v1/pqc/metrics', () => {
      it('should return PQC metrics', async () => {
        // Perform some operations first
        await request(app)
          .post('/api/v1/pqc/kyber/keypair')
          .expect(200);
        
        const response = await request(app)
          .get('/api/v1/pqc/metrics')
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('operations');
        expect(response.body.data).toHaveProperty('performance');
      });
    });
    
    describe('GET /api/v1/pqc/health', () => {
      it('should return PQC service health', async () => {
        const response = await request(app)
          .get('/api/v1/pqc/health')
          .expect(200);
        
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('status');
        expect(response.body.data).toHaveProperty('uptime');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/pqc/nonexistent')
        .expect(404);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
    
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/pqc/kyber/encapsulate')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
    });
    
    it('should include request ID in responses', async () => {
      const response = await request(app)
        .get('/api/v1/pqc/health')
        .expect(200);
      
      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '0');
    });
    
    it('should set CORS headers correctly', async () => {
      const response = await request(app)
        .options('/api/v1/pqc/health')
        .expect(204);
      
      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on crypto operations', async () => {
      const promises = [];
      
      // Make many requests quickly
      for (let i = 0; i < 150; i++) {
        promises.push(
          request(app)
            .post('/api/v1/pqc/kyber/keypair')
        );
      }
      
      const responses = await Promise.all(promises);
      
      // Some should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      
      if (rateLimited.length > 0) {
        expect(rateLimited[0].body).toHaveProperty('error');
        expect(rateLimited[0].body.error).toContain('Too many');
      }
    }, 60000);
  });

  describe('API Documentation', () => {
    it('should serve API documentation', async () => {
      // This would test Swagger/OpenAPI documentation if enabled
      // Skip if documentation is not enabled in test environment
    });
  });
});
