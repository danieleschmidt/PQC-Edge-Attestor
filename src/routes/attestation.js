const express = require('express');
const { AttestationController } = require('../controllers');
const { authMiddleware, validateAttestation, errorHandler } = require('../middleware');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * @route   POST /api/attestation/:deviceId/submit
 * @desc    Submit attestation report for device
 * @access  Private
 */
router.post('/:deviceId/submit', validateAttestation, async (req, res, next) => {
  try {
    await req.attestationController.submitReport(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/attestation/:deviceId/request
 * @desc    Request attestation from device (generate challenge)
 * @access  Private
 */
router.post('/:deviceId/request', async (req, res, next) => {
  try {
    await req.attestationController.requestAttestation(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/attestation/:deviceId/reports
 * @desc    Get attestation reports for device
 * @access  Private
 */
router.get('/:deviceId/reports', async (req, res, next) => {
  try {
    await req.attestationController.getDeviceReports(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/attestation/reports/:reportId
 * @desc    Get specific attestation report
 * @access  Private
 */
router.get('/reports/:reportId', async (req, res, next) => {
  try {
    await req.attestationController.getReport(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/attestation/reports/:reportId/verify
 * @desc    Manually verify attestation report
 * @access  Private
 */
router.post('/reports/:reportId/verify', async (req, res, next) => {
  try {
    await req.attestationController.verifyReport(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/attestation/statistics
 * @desc    Get attestation statistics
 * @access  Private
 */
router.get('/statistics', async (req, res, next) => {
  try {
    await req.attestationController.getReportStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/attestation/reports/bulk/verify
 * @desc    Bulk verify attestation reports
 * @access  Private
 */
router.post('/reports/bulk/verify', async (req, res, next) => {
  try {
    await req.attestationController.bulkVerifyReports(req, res);
  } catch (error) {
    next(error);
  }
});

// Apply error handling middleware
router.use(errorHandler);

module.exports = router;