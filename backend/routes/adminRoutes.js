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
  deleteUser,
  changeUserRole,
  createAdminAccount,
  updateAreaAdminAccount,
  deleteAreaAdminAccount,
} = require('../controllers/adminController');
const { getSystemLogs } = require('../controllers/systemLogController');
const { auth, adminOnly, platformAdminOnly } = require('../middleware/auth');

// ሁሉም አስተዳዳሪ ተግባራት (Admin ብቻ)
router.get('/pending-properties', auth, adminOnly, getPendingProperties);
router.get('/properties', auth, adminOnly, getAdminProperties);
router.put('/verify-property/:id', auth, adminOnly, verifyProperty);
router.put('/reject-property/:id', auth, adminOnly, rejectProperty);
router.get('/users', auth, adminOnly, getAllUsers);
router.get('/stats', auth, adminOnly, getStats);
router.get('/analytics', auth, adminOnly, getAnalytics);
router.get('/system-logs', auth, adminOnly, getSystemLogs);
router.delete('/users/:id', auth, adminOnly, deleteUser);
router.post('/users/admin', auth, platformAdminOnly, createAdminAccount);
router.put('/users/admin/:id', auth, platformAdminOnly, updateAreaAdminAccount);
router.delete('/users/admin/:id', auth, platformAdminOnly, deleteAreaAdminAccount);
router.put('/users/:id/role', auth, platformAdminOnly, changeUserRole);

module.exports = router;