/**
 * @file health.js
 * @brief Health check routes for Generation 1
 */

const express = require('express');
const router = express.Router();

/**
 * @route GET /health
 * @desc Health check endpoint
 */
router.get('/', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        services: {
            pqc: 'operational',
            attestation: 'operational',
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            }
        }
    };

    res.json({
        success: true,
        data: healthData
    });
});

/**
 * @route GET /health/ready
 * @desc Readiness probe endpoint
 */
router.get('/ready', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'ready',
            timestamp: new Date().toISOString()
        }
    });
});

/**
 * @route GET /health/live
 * @desc Liveness probe endpoint
 */
router.get('/live', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'alive',
            timestamp: new Date().toISOString()
        }
    });
});

module.exports = router;