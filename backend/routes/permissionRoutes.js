const express = require('express');
const router = express.Router();
const { getMyPermissions } = require('../controllers/permissionController');
const { auth } = require('../middleware/auth');

router.get('/me', auth, getMyPermissions);

module.exports = router;