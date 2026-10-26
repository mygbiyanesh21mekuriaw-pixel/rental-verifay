const express = require('express');
const {
  getContactDetails,
  submitContactMessage,
  getAreaAdminContactMessages,
  markAreaAdminContactMessageRead,
} = require('../controllers/contactController');
const { auth, platformAdminOnly, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/details', getContactDetails);
router.post('/', submitContactMessage);
const areaAdminOnly = [auth, requireRole('area_admin'), requirePermission('contactMessages')];
const platformAdminContactOnly = [auth, platformAdminOnly];
router.get('/area-admin/inbox', ...areaAdminOnly, getAreaAdminContactMessages);
router.put('/area-admin/inbox/:id/read', ...areaAdminOnly, markAreaAdminContactMessageRead);
router.get('/platform-admin/inbox', ...platformAdminContactOnly, getAreaAdminContactMessages);
router.put('/platform-admin/inbox/:id/read', ...platformAdminContactOnly, markAreaAdminContactMessageRead);

module.exports = router;
