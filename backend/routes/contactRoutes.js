const express = require('express');
const {
  getContactDetails,
  submitContactMessage,
  getPlatformContactMessages,
  markContactMessageRead,
} = require('../controllers/contactController');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/details', getContactDetails);
router.post('/', submitContactMessage);
router.get('/platform-admin/inbox', auth, requireRole('area_admin'), getPlatformContactMessages);
router.put('/platform-admin/inbox/:id/read', auth, requireRole('area_admin'), markContactMessageRead);

module.exports = router;
