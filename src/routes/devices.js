/**
 * @file devices.js
 * @brief Simplified device management routes for Generation 1
 */

const express = require('express');
const Joi = require('joi');
const winston = require('winston');

const router = express.Router();

// Create simple logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console()
    ]
});

/**
 * @route GET /api/v1/devices
 * @desc Get all devices
 */
router.get('/', async (req, res) => {
    try {
        // Mock device data for Generation 1
        const devices = [
            {
                id: 'device-001',
                serialNumber: 'SM-001-2024',
                deviceType: 'smart_meter',
                status: 'active',
                lastSeen: new Date().toISOString()
            },
            {
                id: 'device-002', 
                serialNumber: 'EV-002-2024',
                deviceType: 'ev_charger',
                status: 'active',
                lastSeen: new Date().toISOString()
            }
        ];

        res.json({
            success: true,
            data: { devices },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get devices', { error: error.message });
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /api/v1/devices
 * @desc Register new device
 */
router.post('/', async (req, res) => {
    try {
        // Basic validation
        const schema = Joi.object({
            serialNumber: Joi.string().required(),
            deviceType: Joi.string().valid('smart_meter', 'ev_charger', 'iot_gateway').required(),
            publicKey: Joi.string().required()
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: { message: 'Validation failed', details: error.details },
                timestamp: new Date().toISOString()
            });
        }

        // Mock device registration
        const deviceId = `device-${Date.now()}`;
        
        logger.info('Device registered', { 
            deviceId,
            serialNumber: value.serialNumber,
            deviceType: value.deviceType
        });

        res.status(201).json({
            success: true,
            data: { 
                deviceId,
                serialNumber: value.serialNumber,
                deviceType: value.deviceType,
                status: 'provisioning'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to register device', { error: error.message });
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;