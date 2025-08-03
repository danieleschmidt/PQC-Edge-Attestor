/**
 * @file pqc.js
 * @brief Express routes for post-quantum cryptography operations
 * 
 * Defines REST API endpoints for Kyber key encapsulation, Dilithium signatures,
 * Falcon compact signatures, and hybrid cryptographic operations.
 */

const express = require('express');
const PQCController = require('../controllers/pqcController');
const router = express.Router();

// Initialize controller
const pqcController = new PQCController();

/**
 * @swagger
 * components:
 *   schemas:
 *     KyberKeyPair:
 *       type: object
 *       properties:
 *         publicKey:
 *           type: string
 *           format: base64
 *           description: Base64-encoded Kyber public key
 *         secretKey:
 *           type: string
 *           format: base64
 *           description: Base64-encoded Kyber secret key
 *         algorithm:
 *           type: string
 *           example: kyber-1024
 *         securityLevel:
 *           type: integer
 *           example: 5
 *     
 *     DilithiumKeyPair:
 *       type: object
 *       properties:
 *         publicKey:
 *           type: string
 *           format: base64
 *           description: Base64-encoded Dilithium public key
 *         secretKey:
 *           type: string
 *           format: base64
 *           description: Base64-encoded Dilithium secret key
 *         algorithm:
 *           type: string
 *           example: dilithium-5
 *         securityLevel:
 *           type: integer
 *           example: 5
 *     
 *     FalconKeyPair:
 *       type: object
 *       properties:
 *         publicKey:
 *           type: string
 *           format: base64
 *           description: Base64-encoded Falcon public key
 *         secretKey:
 *           type: string
 *           format: base64
 *           description: Base64-encoded Falcon secret key
 *         algorithm:
 *           type: string
 *           example: falcon-1024
 *         securityLevel:
 *           type: integer
 *           example: 5
 *     
 *     EncapsulationResult:
 *       type: object
 *       properties:
 *         ciphertext:
 *           type: string
 *           format: base64
 *           description: Base64-encoded ciphertext
 *         sharedSecret:
 *           type: string
 *           format: base64
 *           description: Base64-encoded shared secret
 *     
 *     SignatureResult:
 *       type: object
 *       properties:
 *         signature:
 *           type: string
 *           format: base64
 *           description: Base64-encoded signature
 *         algorithm:
 *           type: string
 *           description: Signature algorithm used
 *         messageHash:
 *           type: string
 *           format: hex
 *           description: SHA-256 hash of signed message
 *     
 *     VerificationResult:
 *       type: object
 *       properties:
 *         valid:
 *           type: boolean
 *           description: Whether signature is valid
 *         algorithm:
 *           type: string
 *           description: Signature algorithm used
 *         messageHash:
 *           type: string
 *           format: hex
 *           description: SHA-256 hash of verified message
 */

/**
 * @swagger
 * /pqc/kyber/keypair:
 *   post:
 *     summary: Generate Kyber-1024 key pair
 *     description: Generate a new Kyber-1024 key pair for quantum-resistant key encapsulation
 *     tags: [Kyber]
 *     responses:
 *       200:
 *         description: Key pair generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/KyberKeyPair'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Key generation failed
 */
router.post('/kyber/keypair', 
  PQCController.getKeyGenerationLimiter(),
  (req, res) => pqcController.generateKyberKeyPair(req, res)
);

/**
 * @swagger
 * /pqc/kyber/encapsulate:
 *   post:
 *     summary: Perform Kyber encapsulation
 *     description: Encapsulate a shared secret using Kyber public key
 *     tags: [Kyber]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicKey
 *             properties:
 *               publicKey:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Kyber public key
 *     responses:
 *       200:
 *         description: Encapsulation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/EncapsulationResult'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Encapsulation failed
 */
router.post('/kyber/encapsulate',
  PQCController.getCryptoOperationLimiter(),
  (req, res) => pqcController.kyberEncapsulate(req, res)
);

/**
 * @swagger
 * /pqc/kyber/decapsulate:
 *   post:
 *     summary: Perform Kyber decapsulation
 *     description: Decapsulate shared secret using Kyber secret key and ciphertext
 *     tags: [Kyber]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ciphertext
 *               - secretKey
 *             properties:
 *               ciphertext:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Kyber ciphertext
 *               secretKey:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Kyber secret key
 *     responses:
 *       200:
 *         description: Decapsulation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sharedSecret:
 *                       type: string
 *                       format: base64
 *                       description: Base64-encoded shared secret
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Decapsulation failed
 */
router.post('/kyber/decapsulate',
  PQCController.getCryptoOperationLimiter(),
  (req, res) => pqcController.kyberDecapsulate(req, res)
);

/**
 * @swagger
 * /pqc/dilithium/keypair:
 *   post:
 *     summary: Generate Dilithium-5 key pair
 *     description: Generate a new Dilithium-5 key pair for quantum-resistant digital signatures
 *     tags: [Dilithium]
 *     responses:
 *       200:
 *         description: Key pair generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/DilithiumKeyPair'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Key generation failed
 */
router.post('/dilithium/keypair',
  PQCController.getKeyGenerationLimiter(),
  (req, res) => pqcController.generateDilithiumKeyPair(req, res)
);

/**
 * @swagger
 * /pqc/dilithium/sign:
 *   post:
 *     summary: Create Dilithium digital signature
 *     description: Sign a message using Dilithium secret key
 *     tags: [Dilithium]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - secretKey
 *             properties:
 *               message:
 *                 type: string
 *                 description: Message to sign
 *               secretKey:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Dilithium secret key
 *               encoding:
 *                 type: string
 *                 enum: [utf8, base64, hex]
 *                 default: utf8
 *                 description: Message encoding format
 *     responses:
 *       200:
 *         description: Signature created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SignatureResult'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Signing failed
 */
router.post('/dilithium/sign',
  PQCController.getCryptoOperationLimiter(),
  (req, res) => pqcController.dilithiumSign(req, res)
);

/**
 * @swagger
 * /pqc/dilithium/verify:
 *   post:
 *     summary: Verify Dilithium digital signature
 *     description: Verify a Dilithium signature against a message and public key
 *     tags: [Dilithium]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signature
 *               - message
 *               - publicKey
 *             properties:
 *               signature:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Dilithium signature
 *               message:
 *                 type: string
 *                 description: Original message
 *               publicKey:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Dilithium public key
 *               encoding:
 *                 type: string
 *                 enum: [utf8, base64, hex]
 *                 default: utf8
 *                 description: Message encoding format
 *     responses:
 *       200:
 *         description: Verification completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/VerificationResult'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Verification failed
 */
router.post('/dilithium/verify',
  PQCController.getCryptoOperationLimiter(),
  (req, res) => pqcController.dilithiumVerify(req, res)
);

/**
 * @swagger
 * /pqc/falcon/keypair:
 *   post:
 *     summary: Generate Falcon-1024 key pair
 *     description: Generate a new Falcon-1024 key pair for compact quantum-resistant signatures
 *     tags: [Falcon]
 *     responses:
 *       200:
 *         description: Key pair generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FalconKeyPair'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Key generation failed
 */
router.post('/falcon/keypair',
  PQCController.getKeyGenerationLimiter(),
  (req, res) => pqcController.generateFalconKeyPair(req, res)
);

/**
 * @swagger
 * /pqc/falcon/sign:
 *   post:
 *     summary: Create Falcon compact signature
 *     description: Sign a message using Falcon secret key (compact signature)
 *     tags: [Falcon]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - secretKey
 *             properties:
 *               message:
 *                 type: string
 *                 description: Message to sign
 *               secretKey:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Falcon secret key
 *               encoding:
 *                 type: string
 *                 enum: [utf8, base64, hex]
 *                 default: utf8
 *                 description: Message encoding format
 *     responses:
 *       200:
 *         description: Signature created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SignatureResult'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Signing failed
 */
router.post('/falcon/sign',
  PQCController.getCryptoOperationLimiter(),
  (req, res) => pqcController.falconSign(req, res)
);

/**
 * @swagger
 * /pqc/falcon/verify:
 *   post:
 *     summary: Verify Falcon compact signature
 *     description: Verify a Falcon signature against a message and public key
 *     tags: [Falcon]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signature
 *               - message
 *               - publicKey
 *             properties:
 *               signature:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Falcon signature
 *               message:
 *                 type: string
 *                 description: Original message
 *               publicKey:
 *                 type: string
 *                 format: base64
 *                 description: Base64-encoded Falcon public key
 *               encoding:
 *                 type: string
 *                 enum: [utf8, base64, hex]
 *                 default: utf8
 *                 description: Message encoding format
 *     responses:
 *       200:
 *         description: Verification completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/VerificationResult'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Verification failed
 */
router.post('/falcon/verify',
  PQCController.getCryptoOperationLimiter(),
  (req, res) => pqcController.falconVerify(req, res)
);

/**
 * @swagger
 * /pqc/hybrid/keypair:
 *   post:
 *     summary: Generate hybrid classical + post-quantum key pair
 *     description: Generate a hybrid key pair combining classical ECDSA with post-quantum algorithms
 *     tags: [Hybrid]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - algorithm
 *             properties:
 *               algorithm:
 *                 type: string
 *                 enum: [kyber, dilithium, falcon]
 *                 description: Post-quantum algorithm for hybrid pair
 *     responses:
 *       200:
 *         description: Hybrid key pair generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     classical:
 *                       type: object
 *                       properties:
 *                         publicKey:
 *                           type: string
 *                           format: base64
 *                         privateKey:
 *                           type: string
 *                           format: base64
 *                         algorithm:
 *                           type: string
 *                     postQuantum:
 *                       type: object
 *                       properties:
 *                         publicKey:
 *                           type: string
 *                           format: base64
 *                         secretKey:
 *                           type: string
 *                           format: base64
 *                         algorithm:
 *                           type: string
 *                         securityLevel:
 *                           type: integer
 *                     hybrid:
 *                       type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Hybrid key generation failed
 */
router.post('/hybrid/keypair',
  PQCController.getKeyGenerationLimiter(),
  (req, res) => pqcController.generateHybridKeyPair(req, res)
);

/**
 * @swagger
 * /pqc/metrics:
 *   get:
 *     summary: Get PQC service metrics
 *     description: Retrieve performance metrics for post-quantum cryptography operations
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     operations:
 *                       type: object
 *                       description: Operation counts by type
 *                     errors:
 *                       type: object
 *                       description: Error counts by operation
 *                     performance:
 *                       type: object
 *                       description: Performance metrics including average latency
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to retrieve metrics
 */
router.get('/metrics', (req, res) => pqcController.getMetrics(req, res));

/**
 * @swagger
 * /pqc/health:
 *   get:
 *     summary: PQC service health check
 *     description: Check the health status of the post-quantum cryptography service
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: healthy
 *                     uptime:
 *                       type: number
 *                       description: Server uptime in seconds
 *                     version:
 *                       type: string
 *                       example: 1.0.0
 *                     services:
 *                       type: object
 *                       description: Service status information
 *       503:
 *         description: Service is unhealthy
 */
router.get('/health', (req, res) => pqcController.healthCheck(req, res));

module.exports = router;
