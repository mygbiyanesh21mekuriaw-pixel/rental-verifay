const express = require('express');
const { deleteAreaAdminAccount, resetAreaAdminPassword } = require('../controllers/adminController');
const { auth, platformAdminOnly } = require('../middleware/auth');

const router = express.Router();

router.delete('/:id', auth, platformAdminOnly, deleteAreaAdminAccount);
router.post('/:id/reset-password', auth, platformAdminOnly, resetAreaAdminPassword);

module.exports = router;