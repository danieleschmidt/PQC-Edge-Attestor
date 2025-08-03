const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { AttestationService, CryptoService } = require('./services');
const { Device, AttestationReport } = require('./models');
const logger = require('./utils/logger');
const { validateInput } = require('./utils/validators');

class PQCEdgeAttestor {
    constructor(options = {}) {
        this.options = {
            port: options.port || 3000,
            host: options.host || '0.0.0.0',
            environment: options.environment || 'development',
            enableCors: options.enableCors !== false,
            enableRateLimit: options.enableRateLimit !== false,
            enableSecurity: options.enableSecurity !== false,
            ...options
        };

        this.app = express();
        this.services = {};
        
        this.initializeServices();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    initializeServices() {
        try {
            // Initialize crypto service
            this.services.crypto = new CryptoService({
                defaultKemAlgorithm: 'kyber1024',
                defaultSignatureAlgorithm: 'dilithium5',
                hybridMode: true,
                securityLevel: 5
            });

            // Initialize attestation service
            this.services.attestation = new AttestationService({
                maxReportAge: 300000, // 5 minutes
                riskThreshold: 0.5,
                supportedAlgorithms: ['dilithium5', 'falcon1024', 'hybrid']
            });

            // Initialize device registry (in-memory for demo)
            this.services.deviceRegistry = new Map();

            logger.info('PQC services initialized successfully', {
                cryptoService: 'ready',
                attestationService: 'ready',
                deviceRegistry: 'ready'
            });

        } catch (error) {
            logger.error('Failed to initialize services', { error: error.message });
            throw error;
        }
    }

    setupMiddleware() {
        // Security headers
        if (this.options.enableSecurity) {
            this.app.use(helmet({
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        scriptSrc: ["'self'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        imgSrc: ["'self'", "data:", "https:"]
                    }
                },
                hsts: {
                    maxAge: 31536000,
                    includeSubDomains: true,
                    preload: true
                }
            }));
        }

        // CORS
        if (this.options.enableCors) {
            this.app.use(cors({
                origin: this.options.allowedOrigins || false,
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID']
            }));
        }

        // Rate limiting
        if (this.options.enableRateLimit) {
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100, // limit each IP to 100 requests per windowMs
                message: 'Too many requests from this IP',
                standardHeaders: true,
                legacyHeaders: false
            });
            this.app.use(limiter);

            // Stricter limits for sensitive endpoints
            const strictLimiter = rateLimit({
                windowMs: 15 * 60 * 1000,
                max: 10,
                message: 'Too many sensitive requests from this IP'
            });
            this.app.use('/api/attestation', strictLimiter);
            this.app.use('/api/device/provision', strictLimiter);
        }

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                logger.apiRequest(
                    req.method,
                    req.path,
                    res.statusCode,
                    duration,
                    {
                        userAgent: req.get('User-Agent'),
                        ip: req.ip,
                        deviceId: req.get('X-Device-ID')
                    }
                );
            });
            
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                services: {
                    crypto: 'ready',
                    attestation: 'ready',
                    deviceRegistry: 'ready'
                }
            });
        });

        // Metrics endpoint
        this.app.get('/metrics', (req, res) => {
            res.json({
                devices: this.services.deviceRegistry.size,
                cryptoStats: this.services.crypto.getCacheStats(),
                attestationStats: this.services.attestation.getVerificationStats()
            });
        });

        // Device registration
        this.app.post('/api/device/register', async (req, res) => {
            try {
                const deviceData = req.body;
                const device = new Device(deviceData);
                
                this.services.deviceRegistry.set(device.id, device);
                
                logger.auditLog('device_register', {
                    deviceId: device.id,
                    deviceType: device.deviceType,
                    manufacturer: device.manufacturer
                });

                res.status(201).json(device.toJSON());

            } catch (error) {
                logger.error('Device registration failed', { error: error.message });
                res.status(400).json({ error: error.message });
            }
        });

        // Device provisioning
        this.app.post('/api/device/:deviceId/provision', async (req, res) => {
            try {
                const { deviceId } = req.params;
                const { algorithms } = req.body;

                const device = this.services.deviceRegistry.get(deviceId);
                if (!device) {
                    return res.status(404).json({ error: 'Device not found' });
                }

                // Generate cryptographic keys
                const kemKeyPair = await this.services.crypto.generateKEMKeyPair(algorithms.kem);
                const signKeyPair = await this.services.crypto.generateSignatureKeyPair(algorithms.signature);

                device.setPQCAlgorithms(algorithms);
                device.certificates = {
                    kemPublicKey: kemKeyPair.publicKey,
                    signPublicKey: signKeyPair.publicKey
                };
                device.status = 'provisioned';
                device.provisionedAt = new Date();

                logger.deviceProvisioned(deviceId, { algorithms });

                res.json({
                    deviceId: device.id,
                    status: 'provisioned',
                    algorithms: device.pqcAlgorithms,
                    publicKeys: device.certificates
                });

            } catch (error) {
                logger.error('Device provisioning failed', { deviceId: req.params.deviceId, error: error.message });
                res.status(500).json({ error: error.message });
            }
        });

        // Attestation report submission
        this.app.post('/api/attestation/submit', async (req, res) => {
            try {
                const reportData = req.body;
                const report = new AttestationReport(reportData);

                const device = this.services.deviceRegistry.get(report.deviceId);
                if (!device) {
                    return res.status(404).json({ error: 'Device not found' });
                }

                // Verify the attestation report
                const verificationResult = await this.services.attestation.verifyAttestationReport(
                    report,
                    device.certificates.signPublicKey
                );

                // Update device with attestation result
                device.recordAttestation({
                    reportHash: report.calculateReportHash(),
                    measurements: report.measurements,
                    signature: report.signature,
                    verificationResult: verificationResult.isValid
                });

                if (verificationResult.isValid) {
                    logger.attestationSuccess(report.deviceId, { reportId: report.id });
                } else {
                    logger.attestationFailure(report.deviceId, 'verification_failed', { 
                        reportId: report.id, 
                        violations: verificationResult.violations 
                    });
                }

                res.json({
                    reportId: report.id,
                    verificationResult: verificationResult,
                    deviceStatus: device.status,
                    riskAssessment: report.riskAssessment
                });

            } catch (error) {
                logger.error('Attestation submission failed', { error: error.message });
                res.status(400).json({ error: error.message });
            }
        });

        // Get device status
        this.app.get('/api/device/:deviceId', (req, res) => {
            try {
                const { deviceId } = req.params;
                const device = this.services.deviceRegistry.get(deviceId);
                
                if (!device) {
                    return res.status(404).json({ error: 'Device not found' });
                }

                res.json(device.toJSON());

            } catch (error) {
                logger.error('Device status retrieval failed', { deviceId: req.params.deviceId, error: error.message });
                res.status(500).json({ error: error.message });
            }
        });

        // Crypto operations
        this.app.post('/api/crypto/keygen', async (req, res) => {
            try {
                const { type, algorithm } = req.body;

                let keyPair;
                if (type === 'kem') {
                    keyPair = await this.services.crypto.generateKEMKeyPair(algorithm);
                } else if (type === 'signature') {
                    keyPair = await this.services.crypto.generateSignatureKeyPair(algorithm);
                } else {
                    return res.status(400).json({ error: 'Invalid key type' });
                }

                logger.cryptoOperation('keygen', algorithm, { type });

                res.json({
                    type,
                    algorithm,
                    publicKey: keyPair.publicKey,
                    keyId: require('crypto').randomBytes(16).toString('hex')
                });

            } catch (error) {
                logger.cryptoError('keygen', req.body.algorithm, error);
                res.status(500).json({ error: error.message });
            }
        });

        // List devices
        this.app.get('/api/devices', (req, res) => {
            try {
                const devices = Array.from(this.services.deviceRegistry.values())
                    .map(device => device.toJSON());

                res.json({
                    devices,
                    total: devices.length,
                    healthy: devices.filter(d => d.isHealthy).length
                });

            } catch (error) {
                logger.error('Device listing failed', { error: error.message });
                res.status(500).json({ error: error.message });
            }
        });
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            logger.error('Unhandled error', { 
                error: error.message, 
                stack: error.stack,
                path: req.path,
                method: req.method
            });

            res.status(500).json({ 
                error: this.options.environment === 'development' ? error.message : 'Internal server error' 
            });
        });
    }

    async start() {
        try {
            await new Promise((resolve, reject) => {
                this.server = this.app.listen(this.options.port, this.options.host, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            logger.info('PQC-Edge-Attestor started successfully', {
                port: this.options.port,
                host: this.options.host,
                environment: this.options.environment
            });

            return this.server;

        } catch (error) {
            logger.error('Failed to start server', { error: error.message });
            throw error;
        }
    }

    async stop() {
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
            
            logger.info('PQC-Edge-Attestor stopped');
        }
    }

    getApp() {
        return this.app;
    }

    getServices() {
        return this.services;
    }
}

// Export for use as a module
module.exports = PQCEdgeAttestor;

// Start server if run directly
if (require.main === module) {
    const attestor = new PQCEdgeAttestor({
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    });

    attestor.start().catch((error) => {
        logger.error('Failed to start application', { error: error.message });
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully');
        await attestor.stop();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully');
        await attestor.stop();
        process.exit(0);
    });
}