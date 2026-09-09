const express = require('express');
const router = express.Router();
const { getSystemLogs } = require('../controllers/systemLogController');
const { auth, adminOnly } = require('../middleware/auth');

router.get('/system-logs', auth, adminOnly, getSystemLogs);

module.exports = router;
