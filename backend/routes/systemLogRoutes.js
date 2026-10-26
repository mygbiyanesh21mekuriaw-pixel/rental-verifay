const express = require('express');
const router = express.Router();
const { getSystemLogs, getUserActivityTimeline, exportSystemLogsCsv } = require('../controllers/systemLogController');
const { auth, platformAdminOnly } = require('../middleware/auth');

router.get('/system-logs/export', auth, platformAdminOnly, exportSystemLogsCsv);
router.get('/system-logs/user/:userId', auth, platformAdminOnly, getUserActivityTimeline);
router.get('/system-logs', auth, platformAdminOnly, getSystemLogs);

module.exports = router;
