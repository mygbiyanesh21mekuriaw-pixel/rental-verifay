const express = require('express');
const router = express.Router();
const {
  getPendingProperties,
  getAdminProperties,
  verifyProperty,
  rejectProperty,
  getAllUsers,
  getStats,
  getAnalytics,
  getAdminPaymentPeriods,
  deleteUser,
  changeUserRole,
  createAdminAccount,
  updateAreaAdminAccount,
  deleteAreaAdminAccount,
} = require('../controllers/adminController');
const { getSystemLogs } = require('../controllers/systemLogController');
const { auth, adminOnly, areaAdminOnly, platformAdminOnly } = require('../middleware/auth');

// ሁሉም አስተዳዳሪ ተግባራት (Admin ብቻ)
router.get('/pending-properties', auth, areaAdminOnly, getPendingProperties);
router.get('/properties', auth, adminOnly, getAdminProperties);
router.put('/verify-property/:id', auth, areaAdminOnly, verifyProperty);
router.put('/reject-property/:id', auth, areaAdminOnly, rejectProperty);
router.get('/users', auth, platformAdminOnly, getAllUsers);
router.get('/stats', auth, platformAdminOnly, getStats);
router.get('/analytics', auth, platformAdminOnly, getAnalytics);
router.get('/system-logs', auth, platformAdminOnly, getSystemLogs);
router.get('/payment-periods', auth, platformAdminOnly, getAdminPaymentPeriods);
router.delete('/users/:id', auth, platformAdminOnly, deleteUser);
router.post('/users/admin', auth, platformAdminOnly, createAdminAccount);
router.put('/users/admin/:id', auth, platformAdminOnly, updateAreaAdminAccount);
router.delete('/users/admin/:id', auth, platformAdminOnly, deleteAreaAdminAccount);
router.put('/users/:id/role', auth, platformAdminOnly, changeUserRole);

module.exports = router;