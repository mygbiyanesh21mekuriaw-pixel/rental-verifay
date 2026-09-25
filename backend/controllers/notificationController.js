const Notification = require('../models/Notification');

const getUserId = (user) => user.id || user._id;

/**
 * Get notifications for tenant
 */
const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      tenant: getUserId(req.user),
      recipientRole: 'tenant',
    })
      .populate('property', 'title')
      .populate('rentalRequest')
      .sort({ createdAt: -1 });

    const unreadCount = await Notification.countDocuments({
      tenant: getUserId(req.user),
      recipientRole: 'tenant',
      read: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error('Get tenant notifications error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
      error: error.message,
    });
  }
};

/**
 * Get notifications for landlord
 */
const getLandlordNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      landlord: getUserId(req.user),
      recipientRole: 'landlord',
    })
      .populate('property', 'title')
      .populate('rentalRequest')
      .sort({ createdAt: -1 });

    const unreadCount = await Notification.countDocuments({
      landlord: getUserId(req.user),
      recipientRole: 'landlord',
      read: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error('Get landlord notifications error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to get landlord notifications',
      error: error.message,
    });
  }
};

/**
 * Get notifications for admin
 */
const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientRole: 'admin',
    })
      .populate('property', 'title')
      .populate('rentalRequest')
      .sort({ createdAt: -1 });

    const unreadCount = await Notification.countDocuments({
      recipientRole: 'admin',
      read: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error('Get admin notifications error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to get admin notifications',
      error: error.message,
    });
  }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
  try {
    let filter = {
      read: false,
    };

    if (req.user.role === 'tenant') {
      filter.tenant = getUserId(req.user);
      filter.recipientRole = 'tenant';
    } else if (req.user.role === 'landlord') {
      filter.landlord = getUserId(req.user);
      filter.recipientRole = 'landlord';
    } else if (req.user.role === 'admin') {
      filter.recipientRole = 'admin';
    } else {
      return res.status(403).json({
        success: false,
        message: 'Invalid user role',
      });
    }

    const unreadCount = await Notification.countDocuments(filter);

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error('Get unread count error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message,
    });
  }
};

/**
 * Mark one notification as read
 */
const markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Check ownership
    if (req.user.role === 'tenant') {
      if (
        notification.recipientRole !== 'tenant' ||
        !notification.tenant ||
        notification.tenant.toString() !== getUserId(req.user).toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this notification',
        });
      }
    }

    if (req.user.role === 'landlord') {
      if (
        notification.recipientRole !== 'landlord' ||
        !notification.landlord ||
        notification.landlord.toString() !== getUserId(req.user).toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this notification',
        });
      }
    }

    if (req.user.role === 'admin') {
      if (notification.recipientRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this notification',
        });
      }
    }

    if (!['tenant', 'landlord', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this notification',
      });
    }

    notification.read = true;

    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notification,
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message,
    });
  }
};

/**
 * Mark all notifications as read
 */
const markAllNotificationsAsRead = async (req, res) => {
  try {
    let filter = {
      read: false,
    };

    if (req.user.role === 'tenant') {
      filter.tenant = getUserId(req.user);
      filter.recipientRole = 'tenant';
    } else if (req.user.role === 'landlord') {
      filter.landlord = getUserId(req.user);
      filter.recipientRole = 'landlord';
    } else if (req.user.role === 'admin') {
      filter.recipientRole = 'admin';
    } else {
      return res.status(403).json({
        success: false,
        message: 'Invalid user role',
      });
    }

    const result = await Notification.updateMany(
      filter,
      {
        $set: {
          read: true,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message,
    });
  }
};

/**
 * Delete one notification
 */
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Tenant can delete only their own notifications
    if (req.user.role === 'tenant') {
      if (
        notification.recipientRole !== 'tenant' ||
        !notification.tenant ||
        notification.tenant.toString() !== getUserId(req.user).toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this notification',
        });
      }
    }

    // Landlord can delete only their own notifications
    if (req.user.role === 'landlord') {
      if (
        notification.recipientRole !== 'landlord' ||
        !notification.landlord ||
        notification.landlord.toString() !== getUserId(req.user).toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this notification',
        });
      }
    }

    // Admin can delete only admin notifications
    if (req.user.role === 'admin') {
      if (notification.recipientRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this notification',
        });
      }
    }

    if (!['tenant', 'landlord', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this notification',
      });
    }

    await Notification.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    console.error('Delete notification error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message,
    });
  }
};

module.exports = {
  getMyNotifications,
  getLandlordNotifications,
  getAdminNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  deleteNotification,
};