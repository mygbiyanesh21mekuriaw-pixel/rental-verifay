const express = require('express');

const {
  listChapaBanks,
} = require('../utils/payoutProvider');

const router = express.Router();

// GET /api/chapa/banks
router.get('/banks', async (req, res) => {
  try {
    const result = await listChapaBanks();

    if (!result.ok) {
      return res.status(503).json({
        success: false,
        message: result.message,
        banks: [],
      });
    }

    return res.status(200).json({
      success: true,
      banks: result.banks,
      message: result.message || '',
    });
  } catch (error) {
    console.error('Chapa bank list error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load Chapa banks.',
      banks: [],
    });
  }
});

module.exports = router;