const express = require('express');
const {
  getSystemSettings,
  updateSystemSettings,
} = require('../controllers/systemSettingsController');
const { auth, platformAdminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, platformAdminOnly, getSystemSettings);
router.put('/', auth, platformAdminOnly, updateSystemSettings);

module.exports = router;
