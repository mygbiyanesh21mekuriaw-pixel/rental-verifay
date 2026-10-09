const Notification = require('../models/Notification');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const { normalizeAdminAreaObject, buildAdminAreaQuery } = require('../utils/adminArea');

const getUserId = (user) => user.id || user._id;

const getAdminPropertyIds = async (user) => {
  if (user.adminType !== 'area') return null;

  const adminAreas = (user.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
  if (adminAreas.length === 0) return [];

  const properties = await Property.find(buildAdminAreaQuery(adminAreas)).select('_id').lean();
  return properties.map((property) => property._id);
};

const getAdminNotificationFilter = (propertyIds, extra = {}) => ({
  recipientRole: 'admin',
  ...extra,
  ...(propertyIds === null ? {} : { property: { $in: propertyIds } }),
});

const createLandlordNotification = async (
  landlordId,
  propertyId,
  propertyTitle,
  message,
  type = 'info',
  instructions = ''
) => {
  if (!landlordId || !propertyId) return null;

  try {
    return await Notification.create({
      landlord: landlordId,
      recipientRole: 'landlord',
      property: propertyId,
      propertyTitle: propertyTitle || 'Property',
      message,
      type,
      instructions,
      read: false,
    });
  } catch (error) {
    console.error('Create landlord notification failed:', error.message);
    return null;
  }
};

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
    const adminPropertyIds = await getAdminPropertyIds(req.user);
    const propertyScope = adminPropertyIds === null
      ? {}
      : { _id: { $in: adminPropertyIds } };
    const pendingProperties = await Property.find({
      ...propertyScope,
      isVerified: false,
      verificationStatus: 'pending',
    }).select('_id title').lean();

    if (pendingProperties.length > 0) {
      const propertyIds = pendingProperties.map((property) => property._id);
      const existingNotifications = await Notification.find({
        recipientRole: 'admin',
        property: { $in: propertyIds },
        instructions: 'Review this property in the Admin Dashboard.',
      }).select('property').lean();
      const notifiedPropertyIds = new Set(
        existingNotifications.map((notification) => String(notification.property))
      );
      const missingNotifications = pendingProperties
        .filter((property) => !notifiedPropertyIds.has(String(property._id)))
        .map((property) => ({
          recipientRole: 'admin',
          property: property._id,
          propertyTitle: property.title,
          message: `Property awaiting verification: "${property.title}".`,
          type: 'pending',
          instructions: 'Review this property in the Admin Dashboard.',
          read: false,
        }));

      if (missingNotifications.length > 0) {
        await Notification.insertMany(missingNotifications);
      }
    }

    const pendingRequests = await RentalRequest.find({
      status: 'pending',
      ...(adminPropertyIds === null ? {} : { property: { $in: adminPropertyIds } }),
    })
      .populate('property', 'title')
      .select('_id property tenantName')
      .lean();

    if (pendingRequests.length > 0) {
      const requestIds = pendingRequests.map((request) => request._id);
      const existingRequestNotifications = await Notification.find({
        recipientRole: 'admin',
        rentalRequest: { $in: requestIds },
      }).select('rentalRequest').lean();
      const notifiedRequestIds = new Set(
        existingRequestNotifications.map((notification) => String(notification.rentalRequest))
      );
      const missingRequestNotifications = pendingRequests
        .filter((request) => request.property && !notifiedRequestIds.has(String(request._id)))
        .map((request) => ({
          recipientRole: 'admin',
          property: request.property._id,
          rentalRequest: request._id,
          propertyTitle: request.property.title || 'Property',
          message: `New rental request submitted by ${request.tenantName || 'a tenant'}.`,
          type: 'pending',
          instructions: 'Review this rental request in the Admin Dashboard.',
          read: false,
        }));

      if (missingRequestNotifications.length > 0) {
        await Notification.insertMany(missingRequestNotifications);
      }
    }

    const notificationFilter = getAdminNotificationFilter(adminPropertyIds);
    const notifications = await Notification.find(notificationFilter)
      .populate('property', 'title')
      .populate('rentalRequest')
      .sort({ createdAt: -1 });

    const unreadCount = await Notification.countDocuments(
      getAdminNotificationFilter(adminPropertyIds, { read: false }),
    );

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
      const adminPropertyIds = await getAdminPropertyIds(req.user);
      Object.assign(filter, getAdminNotificationFilter(adminPropertyIds));
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
    const adminPropertyIds = req.user.role === 'admin'
      ? await getAdminPropertyIds(req.user)
      : null;
    const notification = req.user.role === 'admin'
      ? await Notification.findOne({
        _id: req.params.id,
        ...getAdminNotificationFilter(adminPropertyIds),
      })
      : await Notification.findById(req.params.id);

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
      const adminPropertyIds = await getAdminPropertyIds(req.user);
      Object.assign(filter, getAdminNotificationFilter(adminPropertyIds));
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
    const adminPropertyIds = req.user.role === 'admin'
      ? await getAdminPropertyIds(req.user)
      : null;
    const notification = req.user.role === 'admin'
      ? await Notification.findOne({
        _id: req.params.id,
        ...getAdminNotificationFilter(adminPropertyIds),
      })
      : await Notification.findById(req.params.id);

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
  createLandlordNotification,
  getMyNotifications,
  getLandlordNotifications,
  getAdminNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  deleteNotification,
};