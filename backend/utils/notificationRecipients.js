const User = require('../models/User');
const { propertyMatchesAdminAreas, normalizeAdminAreaObject } = require('./adminArea');

const getAdminAreas = (admin) => {
  if (admin.assignedArea) return [admin.assignedArea];
  return (admin.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
};

const getAreaAdminIdsForProperty = async (property) => {
  if (!property) return [];

  const admins = await User.find({
    role: 'admin',
    isActive: { $ne: false },
    $or: [
      { adminType: 'area' },
      { assignedArea: { $exists: true, $ne: '' } },
      { adminAreas: { $exists: true, $not: { $size: 0 } } },
    ],
  })
    .select('_id assignedArea adminAreas')
    .lean();

  return admins
    .filter((admin) => propertyMatchesAdminAreas(property, getAdminAreas(admin)))
    .map((admin) => admin._id);
};

const createAreaAdminNotifications = async (property, notification) => {
  const recipientIds = await getAreaAdminIdsForProperty(property);
  if (recipientIds.length === 0) return [];

  return notificationModelInsertMany(recipientIds.map((recipient) => ({
    ...notification,
    recipient,
    recipientRole: 'admin',
  })));
};

const notificationModelInsertMany = async (notifications) => {
  const Notification = require('../models/Notification');
  return Notification.insertMany(notifications);
};

module.exports = {
  createAreaAdminNotifications,
  getAreaAdminIdsForProperty,
};
