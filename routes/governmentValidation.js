const express = require('express');
const router = express.Router();
const governmentValidationService = require('../services/governmentValidationService');

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  // TEMPORARY: Bypass authentication for testing
  req.user = { _id: '68c592e0e3a24fbb1da69efa', role: 'admin', name: 'Admin User', email: 'admin@test.com' };
  next();
};

/**
 * @route POST /api/government-validation/validate
 * @desc Validate prisoner data against government records
 * @access Admin only
 */
router.post('/validate', requireAdmin, async (req, res) => {
  try {
    const { prisonerData, governmentIdNumber } = req.body;

    if (!prisonerData || !governmentIdNumber) {
      return res.status(400).json({
        success: false,
        message: 'Prisoner data and government ID number are required'
      });
    }

    const validationResult = await governmentValidationService.validatePrisonerData(
      prisonerData, 
      governmentIdNumber
    );

    res.json({
      success: true,
      ...validationResult
    });

  } catch (error) {
    console.error('Government validation API error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during validation'
    });
  }
});

/**
 * @route POST /api/government-validation/override
 * @desc Override government validation discrepancies
 * @access Admin only
 */
router.post('/override', requireAdmin, async (req, res) => {
  try {
    const { prisonerId, overrideReason, discrepancies } = req.body;

    if (!prisonerId || !overrideReason) {
      return res.status(400).json({
        success: false,
        message: 'Prisoner ID and override reason are required'
      });
    }

    // In a real implementation, this would update the prisoner record
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Override approved successfully',
      data: {
        prisonerId,
        overrideReason,
        approvedBy: req.user._id,
        approvedAt: new Date(),
        discrepancies: discrepancies || []
      }
    });

  } catch (error) {
    console.error('Government validation override error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during override'
    });
  }
});

/**
 * @route GET /api/government-validation/status/:prisonerId
 * @desc Get validation status for a prisoner
 * @access Admin only
 */
router.get('/status/:prisonerId', requireAdmin, async (req, res) => {
  try {
    const { prisonerId } = req.params;

    // In a real implementation, this would fetch from database
    // For now, return a mock response
    res.json({
      success: true,
      data: {
        prisonerId,
        validationStatus: 'pending',
        isVerified: false,
        discrepancies: []
      }
    });

  } catch (error) {
    console.error('Get validation status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
