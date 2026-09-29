const express = require('express');
const router = express.Router();
const {
	register,
	login,
	logout,
	getMe,
	updateProfile,
	changePassword,
	requestPasswordReset,
	resetPassword,
} = require('../controllers/authController');
const { auth } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/logout', auth, logout);
router.get('/me', auth, getMe);

router.put('/profile', auth, updateProfile);
router.put('/change-password', auth, changePassword);

module.exports = router;