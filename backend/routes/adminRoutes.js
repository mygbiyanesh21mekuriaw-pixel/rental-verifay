const express = require('express');
const router = express.Router();
const {
  getPendingProperties,
  getAdminProperties,
  verifyProperty,
  rejectProperty,
  getAllUsers,
  getUserPermissionDetails,
  updateUserPermissions,
  approveUser,
  createAreaAdmin,
  getStats,
  getAnalytics,
  getAdminPaymentPeriods,
  deleteUser,
  setUserActive,
  changeUserRole,
  createAdminAccount,
  updateAreaAdminAccount,
  deleteAreaAdminAccount,
  setAreaAdminActive,
} = require('../controllers/adminController');
const { getSystemLogs } = require('../controllers/systemLogController');
const { getAllDemoAccounts } = require('../controllers/bankAccountController');
const { auth, adminOnly, areaAdminOnly, platformAdminOnly, requireRole, requirePermission, requireAdminPropertyPermission } = require('../middleware/auth');

const usersListRoleGuard = (req, res, next) => {
  if (req.query.status === 'pending') return platformAdminOnly(req, res, next);
  return requireRole('platform_admin', 'area_admin')(req, res, next);
};

// ሁሉም አስተዳዳሪ ተግባራት (Admin ብቻ)
router.get('/pending-properties', auth, areaAdminOnly, requirePermission('pendingProperties'), getPendingProperties);
router.get('/properties', auth, adminOnly, requireAdminPropertyPermission, getAdminProperties);
router.put('/verify-property/:id', auth, areaAdminOnly, requirePermission('pendingProperties'), verifyProperty);
router.put('/reject-property/:id', auth, areaAdminOnly, requirePermission('pendingProperties'), rejectProperty);
router.get('/users', auth, usersListRoleGuard, requirePermission('users'), getAllUsers);
router.get('/users/:id/permissions', auth, platformAdminOnly, getUserPermissionDetails);
router.put('/users/:id/permissions', auth, platformAdminOnly, updateUserPermissions);
router.post('/users/:id/approve', auth, platformAdminOnly, approveUser);
router.post('/area-admins', auth, platformAdminOnly, createAreaAdmin);
router.get('/stats', auth, platformAdminOnly, getStats);
router.get('/analytics', auth, platformAdminOnly, getAnalytics);
router.get('/system-logs', auth, requireRole('platform_admin'), getSystemLogs);
router.get('/payment-periods', auth, platformAdminOnly, getAdminPaymentPeriods);
router.get('/demo-bank-accounts', auth, platformAdminOnly, getAllDemoAccounts);
router.delete('/users/:id', auth, requireRole('platform_admin', 'area_admin'), requirePermission('users'), deleteUser);
router.patch('/users/:id/active', auth, requireRole('platform_admin', 'area_admin'), requirePermission('users'), setUserActive);
router.post('/users/admin', auth, platformAdminOnly, createAdminAccount);
router.put('/users/admin/:id', auth, platformAdminOnly, updateAreaAdminAccount);
router.delete('/users/admin/:id', auth, platformAdminOnly, deleteAreaAdminAccount);
router.patch('/users/admin/:id/active', auth, platformAdminOnly, setAreaAdminActive);
router.put('/users/:id/role', auth, platformAdminOnly, changeUserRole);

module.exports = router;