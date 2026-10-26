const express = require('express');
const router = express.Router();
const {
  getMyNotifications,
  getLandlordNotifications,
  getAdminNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  deleteNotification,
} = require('../controllers/notificationController');
const { auth, adminOnly, landlordOnly, requirePermission } = require('../middleware/auth');

const roleAwareHandler = async (req, res) => {
  if (req.user.role === 'tenant') {
    return getMyNotifications(req, res);
  }
  if (req.user.role === 'landlord') {
    return getLandlordNotifications(req, res);
  }
  if (req.user.role === 'admin') {
    return getAdminNotifications(req, res);
  }
  return res.status(403).json({ message: 'Only tenants, landlords, and admins can access notifications' });
};

router.get('/', auth, requirePermission('notifications'), roleAwareHandler);
router.get('/all', auth, adminOnly, requirePermission('notifications'), getAdminNotifications);
router.get('/landlord', auth, landlordOnly, requirePermission('notifications'), getLandlordNotifications);
router.get('/unread-count', auth, requirePermission('notifications'), getUnreadCount);
router.put('/:id/read', auth, requirePermission('notifications'), markNotificationAsRead);
router.put('/read-all', auth, requirePermission('notifications'), markAllNotificationsAsRead);
router.delete('/:id', auth, requirePermission('notifications'), deleteNotification);

module.exports = router;