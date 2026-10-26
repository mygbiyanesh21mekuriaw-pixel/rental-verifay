const express = require('express');
const {
  getContactDetails,
  submitContactMessage,
  getAreaAdminContactMessages,
  markAreaAdminContactMessageRead,
} = require('../controllers/contactController');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/details', getContactDetails);
router.post('/', submitContactMessage);
const areaAdminOnly = [auth, requireRole('area_admin')];
router.get('/area-admin/inbox', ...areaAdminOnly, getAreaAdminContactMessages);
router.put('/area-admin/inbox/:id/read', ...areaAdminOnly, markAreaAdminContactMessageRead);
router.get('/platform-admin/inbox', ...areaAdminOnly, getAreaAdminContactMessages);
router.put('/platform-admin/inbox/:id/read', ...areaAdminOnly, markAreaAdminContactMessageRead);

module.exports = router;
