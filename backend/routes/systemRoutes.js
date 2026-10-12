const express = require('express');
const { getPublicSystemStatus } = require('../controllers/systemSettingsController');

const router = express.Router();

router.get('/status', getPublicSystemStatus);

module.exports = router;
