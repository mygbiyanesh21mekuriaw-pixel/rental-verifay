const express = require('express');
const { changePasswordOnFirstLogin, logout } = require('../controllers/authController');
const { auth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.post('/change-password', auth, requirePermission('changePassword'), changePasswordOnFirstLogin);
router.post('/logout', auth, logout);

module.exports = router;