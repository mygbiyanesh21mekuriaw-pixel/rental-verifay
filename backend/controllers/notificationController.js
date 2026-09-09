const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Property = require('../models/Property');

const isValidObjectId = (value) => value && mongoose.Types.ObjectId.isValid(value);

// ===== አዲስ ማሳወቂያ መፍጠር =====
const createNotification = async (tenantId, propertyId, propertyTitle, message, type, instructions) => {
  try {
    const notification = new Notification({
      tenant: tenantId,
      recipientRole: 'tenant',
      property: propertyId,
      propertyTitle: propertyTitle,
      message: message,
      type: type,
      instructions: instructions || '',
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

const createLandlordNotification = async (landlordId, propertyId, propertyTitle, message, type, instructions) => {
  try {
    const notification = new Notification({
      landlord: landlordId,
      recipientRole: 'landlord',
      property: propertyId,
      propertyTitle,
      message,
      type,
      instructions: instructions || '',
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating landlord notification:', error);
    return null;
  }
};

const getAccessibleNotificationFilter = async (req) => {
  const { role, id: userId } = req.user;

  if (role === 'tenant') {
    return { tenant: userId, recipientRole: 'tenant' };
  }

  if (role === 'landlord') {
    return { landlord: userId, recipientRole: 'landlord' };
  }

  if (role === 'admin') {
    return {};
  }

  return { _id: null };
};

const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({})
      .populate('tenant', 'name email role')
      .populate('property', 'title location landlord')
      .populate('rentalRequest', 'status createdAt')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching admin notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== የተከራዩን ማሳወቂያዎች ማግኘት =====
const getMyNotifications = async (req, res) => {
  try {
    const tenantId = req.user.id;
    const notifications = await Notification.find({ tenant: tenantId })
      .populate('rentalRequest', 'status createdAt')
      .populate('property', 'title location')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLandlordNotifications = async (req, res) => {
  try {
    const landlordId = req.user.id;
    const notifications = await Notification.find({
      landlord: landlordId,
      recipientRole: 'landlord',
    })
      .populate('landlord', 'name email')
      .populate('property', 'title location')
      .populate('rentalRequest', 'status createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching landlord notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ማሳወቂያ እንደተነበበ ምልክት ማድረግ =====
const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid notification id' });
    }

    const notification = await Notification.findById(id).populate('property', 'landlord title');
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const role = req.user.role;
    const canAccess =
      (role === 'tenant' && notification.recipientRole === 'tenant' && String(notification.tenant) === String(req.user.id)) ||
      (role === 'landlord' && notification.recipientRole === 'landlord' && String(notification.landlord) === String(req.user.id)) ||
      (role === 'admin');

    if (!canAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    notification.read = true;
    await notification.save();

    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ሁሉንም ማሳወቂያዎች እንደተነበበ ምልክት ማድረግ =====
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const filter = await getAccessibleNotificationFilter(req);
    if (!filter || Object.keys(filter).length === 0 && req.user.role === 'admin') {
      await Notification.updateMany({ read: false }, { read: true });
      return res.json({ message: 'All notifications marked as read' });
    }

    await Notification.updateMany({ ...filter, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ያልተነበቡ ማሳወቂያዎች ብዛት =====
const getUnreadCount = async (req, res) => {
  try {
    const filter = await getAccessibleNotificationFilter(req);
    const count = await Notification.countDocuments({ ...filter, read: false });
    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createNotification,
  createLandlordNotification,
  getMyNotifications,
  getLandlordNotifications,
  getAdminNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
};