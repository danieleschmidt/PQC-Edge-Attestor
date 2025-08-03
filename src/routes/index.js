const express = require('express');
const deviceRoutes = require('./devices');
const attestationRoutes = require('./attestation');
const otaRoutes = require('./ota');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API version info
router.get('/version', (req, res) => {
  res.json({
    api: 'PQC Edge Attestor',
    version: '1.0.0',
    description: 'Post-Quantum Cryptography framework for IoT edge device attestation',
    endpoints: {
      devices: '/api/devices',
      attestation: '/api/attestation',
      ota: '/api/ota'
    },
    documentation: 'https://github.com/danieleschmidt/PQC-Edge-Attestor'
  });
});

// Mount route modules
router.use('/devices', deviceRoutes);
router.use('/attestation', attestationRoutes);
router.use('/ota', otaRoutes);

module.exports = router;