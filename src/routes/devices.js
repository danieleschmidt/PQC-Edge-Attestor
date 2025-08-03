const express = require('express');
const { DeviceController } = require('../controllers');
const { authMiddleware, validateDevice, errorHandler } = require('../middleware');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * @route   POST /api/devices
 * @desc    Register a new device
 * @access  Private
 */
router.post('/', validateDevice, async (req, res, next) => {
  try {
    await req.deviceController.registerDevice(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/devices
 * @desc    List devices with pagination and filtering
 * @access  Private
 */
router.get('/', async (req, res, next) => {
  try {
    await req.deviceController.listDevices(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/devices/statistics
 * @desc    Get device statistics
 * @access  Private
 */
router.get('/statistics', async (req, res, next) => {
  try {
    await req.deviceController.getDeviceStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/devices/:deviceId
 * @desc    Get device by ID
 * @access  Private
 */
router.get('/:deviceId', async (req, res, next) => {
  try {
    await req.deviceController.getDevice(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/devices/:deviceId
 * @desc    Update device information
 * @access  Private
 */
router.put('/:deviceId', async (req, res, next) => {
  try {
    await req.deviceController.updateDevice(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/devices/:deviceId
 * @desc    Delete (revoke) device
 * @access  Private
 */
router.delete('/:deviceId', async (req, res, next) => {
  try {
    await req.deviceController.deleteDevice(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/devices/:deviceId/provision
 * @desc    Provision device with PQC algorithms
 * @access  Private
 */
router.post('/:deviceId/provision', async (req, res, next) => {
  try {
    await req.deviceController.provisionDevice(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/devices/:deviceId/revoke
 * @desc    Revoke device credentials
 * @access  Private
 */
router.post('/:deviceId/revoke', async (req, res, next) => {
  try {
    await req.deviceController.revokeDevice(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/devices/:deviceId/algorithms
 * @desc    Update device PQC algorithms
 * @access  Private
 */
router.put('/:deviceId/algorithms', async (req, res, next) => {
  try {
    await req.deviceController.updatePQCAlgorithms(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/devices/:deviceId/health
 * @desc    Get device health status
 * @access  Private
 */
router.get('/:deviceId/health', async (req, res, next) => {
  try {
    await req.deviceController.getHealthStatus(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/devices/bulk/status
 * @desc    Bulk update device status
 * @access  Private
 */
router.put('/bulk/status', async (req, res, next) => {
  try {
    await req.deviceController.bulkUpdateStatus(req, res);
  } catch (error) {
    next(error);
  }
});

// Apply error handling middleware
router.use(errorHandler);

module.exports = router;