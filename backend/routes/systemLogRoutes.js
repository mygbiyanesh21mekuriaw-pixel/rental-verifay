const express = require('express');
const router = express.Router();
const { getSystemLogs } = require('../controllers/systemLogController');
const { auth, platformAdminOnly } = require('../middleware/auth');

router.get('/system-logs', auth, platformAdminOnly, getSystemLogs);

module.exports = router;
