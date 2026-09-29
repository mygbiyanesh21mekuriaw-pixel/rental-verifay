const express = require('express');
const {
  getContactDetails,
  submitContactMessage,
  getPlatformContactMessages,
  markContactMessageRead,
} = require('../controllers/contactController');
const { auth, platformAdminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/details', getContactDetails);
router.post('/', submitContactMessage);
router.get('/platform-admin/inbox', auth, platformAdminOnly, getPlatformContactMessages);
router.put('/platform-admin/inbox/:id/read', auth, platformAdminOnly, markContactMessageRead);

module.exports = router;
