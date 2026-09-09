const express = require('express');
const router = express.Router();
const {
  getMyNotifications,
  getLandlordNotifications,
  getAdminNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
} = require('../controllers/notificationController');
const { auth, adminOnly, landlordOnly } = require('../middleware/auth');

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

router.get('/', auth, roleAwareHandler);
router.get('/all', auth, adminOnly, getAdminNotifications);
router.get('/landlord', auth, landlordOnly, getLandlordNotifications);
router.get('/unread-count', auth, getUnreadCount);
router.put('/:id/read', auth, markNotificationAsRead);
router.put('/read-all', auth, markAllNotificationsAsRead);

module.exports = router;