const Notification = require('../models/Notification');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const User = require('../models/User');
const { normalizeAdminAreaObject, buildAdminAreaQuery } = require('../utils/adminArea');

const getUserId = (user) => user.id || user._id;

const getAdminPropertyIds = async (user) => {
  const admin = await User.findById(getUserId(user))
    .select('_id role adminType adminAreas assignedArea isActive')
    .lean();
  if (!admin || admin.role !== 'admin' || admin.isActive === false) return [];
  const adminType = admin.adminType ||
    ((admin.adminAreas || []).length || admin.assignedArea ? 'area' : 'platform');
  if (adminType === 'platform') return null;

  const adminAreas = admin.assignedArea
    ? [normalizeAdminAreaObject(admin.assignedArea)].filter(Boolean)
    : (admin.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
  if (adminAreas.length === 0) return [];

  const properties = await Property.find(buildAdminAreaQuery(adminAreas)).select('_id').lean();
  return properties.map((property) => property._id);
};

const getAdminNotificationFilter = (propertyIds, extra = {}) => ({
  recipientRole: 'admin',
  ...extra,
  ...(propertyIds === null ? {} : { property: { $in: propertyIds } }),
});

const getAdminNotificationCategoryFilter = (category) => {
  if (category === 'properties') {
    return {
      type: { $in: ['approved', 'rejected', 'pending'] },
      $or: [{ rentalRequest: { $exists: false } }, { rentalRequest: null }],
    };
  }
  if (category === 'rentals') return { rentalRequest: { $exists: true, $ne: null } };
  if (category === 'system') return { type: 'info', rentalRequest: { $exists: false } };
  if (category === 'messages') return { _id: { $in: [] } };
  return {};
};

const getAdminNotificationQuery = (propertyIds, { type, unread } = {}) => {
  const filter = getAdminNotificationFilter(propertyIds);
  if (type) Object.assign(filter, getAdminNotificationCategoryFilter(type));
  if (unread === true) filter.read = false;
  return filter;
};

const sanitizeNotificationText = (value) => String(value || '')
  .replace(/\bauthorization\b["']?\s*[:=]\s*(?:Bearer\s+)?[^\s,}"']+/gi, 'Authorization: [redacted]')
  .replace(/\b(password|passcode|token|secret|api[_ -]?key)\b["']?\s*[:=]\s*["']?[^,\s}"']+/gi, '$1: [redacted]')
  .replace(/\b(?:eyJ[A-Za-z0-9_-]{10,}\.)[A-Za-z0-9._~-]+/g, '[redacted token]')
  .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]');

const serializeNotification = (notification) => {
  const property = notification.property && typeof notification.property === 'object'
    ? {
      id: String(notification.property._id || notification.property.id || ''),
      title: notification.property.title || notification.propertyTitle || '',
    }
    : { id: String(notification.property || ''), title: notification.propertyTitle || '' };
  const rentalRequest = notification.rentalRequest && typeof notification.rentalRequest === 'object'
    ? String(notification.rentalRequest._id || notification.rentalRequest.id || '')
    : String(notification.rentalRequest || '');
  const category = rentalRequest
    ? 'rentals'
    : notification.type === 'info'
      ? 'system'
      : 'properties';

  return {
    _id: String(notification._id),
    property,
    rentalRequest: rentalRequest || null,
    propertyTitle: sanitizeNotificationText(notification.propertyTitle || property.title),
    message: sanitizeNotificationText(notification.message),
    instructions: sanitizeNotificationText(notification.instructions),
    type: notification.type,
    category,
    read: notification.read === true,
    createdAt: notification.createdAt,
  };
};

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
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const type = String(req.query.type || '').trim().toLowerCase();
    const allowedTypes = ['properties', 'rentals', 'messages', 'system'];
    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid notification type.' });
    }
    let unread;
    if (req.query.unread !== undefined) {
      if (!['true', 'false'].includes(String(req.query.unread).toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Invalid unread filter.' });
      }
      unread = String(req.query.unread).toLowerCase() === 'true';
    }
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

    const notificationFilter = getAdminNotificationQuery(adminPropertyIds, { type, unread });
    const totalFilter = getAdminNotificationFilter(adminPropertyIds);
    const categoryCounts = {};
    await Promise.all(['properties', 'rentals', 'messages', 'system'].map(async (category) => {
      const categoryFilter = getAdminNotificationCategoryFilter(category);
      const [total, unreadTotal] = await Promise.all([
        Notification.countDocuments({ ...totalFilter, ...categoryFilter }),
        Notification.countDocuments({ ...totalFilter, ...categoryFilter, read: false }),
      ]);
      categoryCounts[category] = { total, unread: unreadTotal };
    }));
    const [total, unreadCount, notifications] = await Promise.all([
      Notification.countDocuments(notificationFilter),
      Notification.countDocuments(getAdminNotificationFilter(adminPropertyIds, { read: false })),
      Notification.find(notificationFilter)
        .populate('property', 'title')
        .populate('rentalRequest', '_id')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      unreadCount,
      totals: { total, unread: unreadCount, byType: categoryCounts },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: page * limit < total,
      },
      notifications: notifications.map(serializeNotification),
    });
  } catch (error) {
    console.error('Get admin notifications error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to get admin notifications',
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
      notification: serializeNotification(notification),
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

const clearReadNotifications = async (req, res) => {
  try {
    let filter = { read: true };
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
      return res.status(403).json({ success: false, message: 'Invalid user role' });
    }

    const result = await Notification.deleteMany(filter);
    return res.status(200).json({
      success: true,
      message: 'Read notifications cleared',
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    console.error('Clear read notifications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear read notifications' });
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
  clearReadNotifications,
  getUnreadCount,
  deleteNotification,
};