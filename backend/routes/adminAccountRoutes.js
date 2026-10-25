const express = require('express');
const { resetAreaAdminPassword } = require('../controllers/adminController');
const { auth, platformAdminOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/:id/reset-password', auth, platformAdminOnly, resetAreaAdminPassword);

module.exports = router;