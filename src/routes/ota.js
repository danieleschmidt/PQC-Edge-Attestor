const express = require('express');
const { OTAController } = require('../controllers');
const { authMiddleware, validateOTAUpdate, errorHandler } = require('../middleware');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * @route   POST /api/ota/:deviceId/initiate
 * @desc    Initiate OTA firmware update for device
 * @access  Private
 */
router.post('/:deviceId/initiate', validateOTAUpdate, async (req, res, next) => {
  try {
    await req.otaController.initiateUpdate(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/ota/:deviceId/updates/:updateId/status
 * @desc    Update OTA update status (called by device)
 * @access  Private
 */
router.put('/:deviceId/updates/:updateId/status', async (req, res, next) => {
  try {
    await req.otaController.updateStatus(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/ota/:deviceId/updates
 * @desc    Get OTA update history for device
 * @access  Private
 */
router.get('/:deviceId/updates', async (req, res, next) => {
  try {
    await req.otaController.getUpdateHistory(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/ota/:deviceId/status
 * @desc    Get current OTA update status for device
 * @access  Private
 */
router.get('/:deviceId/status', async (req, res, next) => {
  try {
    await req.otaController.getDeviceUpdateStatus(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ota/:deviceId/updates/:updateId/cancel
 * @desc    Cancel pending OTA update
 * @access  Private
 */
router.post('/:deviceId/updates/:updateId/cancel', async (req, res, next) => {
  try {
    await req.otaController.cancelUpdate(req, res);
  } catch (error) {
    next(error);
  }
});

// Apply error handling middleware
router.use(errorHandler);

module.exports = router;