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
} = require('../controllers/adminController');
const { getRentalRequests, getRentRequestById, updateRentalRequestStatus } = require('../controllers/rentalRequestController');
const { getSystemLogs } = require('../controllers/systemLogController');
const { auth, adminOnly } = require('../middleware/auth');

// ሁሉም አስተዳዳሪ ተግባራት (Admin ብቻ)
router.get('/pending-properties', auth, adminOnly, getPendingProperties);
router.get('/properties', auth, adminOnly, getAdminProperties);
router.put('/verify-property/:id', auth, adminOnly, verifyProperty);
router.put('/reject-property/:id', auth, adminOnly, rejectProperty);
router.get('/users', auth, adminOnly, getAllUsers);
router.get('/stats', auth, adminOnly, getStats);
router.get('/analytics', auth, adminOnly, getAnalytics);
router.get('/system-logs', auth, adminOnly, getSystemLogs);
router.get('/rental-requests', auth, adminOnly, getRentalRequests);
router.get('/rental-requests/:id', auth, adminOnly, getRentRequestById);
router.put('/rental-requests/:id/status', auth, adminOnly, updateRentalRequestStatus);
router.delete('/users/:id', auth, adminOnly, deleteUser);
router.put('/users/:id/role', auth, adminOnly, changeUserRole);

module.exports = router;