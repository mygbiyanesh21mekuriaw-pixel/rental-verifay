const test = require('node:test');
const assert = require('node:assert/strict');
const Notification = require('../models/Notification');
const Property = require('../models/Property');
const {
  getUnreadCount,
  markNotificationAsRead,
  deleteNotification,
} = require('./notificationController');

const areaAdmin = {
  id: 'area-admin-id',
  role: 'admin',
  adminType: 'area',
  adminAreas: [{ city: 'Mekelle' }],
};

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createPropertyQuery = (properties) => ({
  select() {
    return this;
  },
  lean() {
    return Promise.resolve(properties);
  },
});

test('area-admin unread notification count is limited to properties in the assigned area', async () => {
  const originalPropertyFind = Property.find;
  const originalNotificationCount = Notification.countDocuments;
  let notificationFilter;
  Property.find = () => createPropertyQuery([{ _id: 'property-a' }]);
  Notification.countDocuments = async (filter) => {
    notificationFilter = filter;
    return 1;
  };
  const response = createResponse();

  try {
    await getUnreadCount({ user: areaAdmin }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.unreadCount, 1);
    assert.equal(notificationFilter.recipientRole, 'admin');
    assert.equal(notificationFilter.read, false);
    assert.deepEqual(notificationFilter.property, { $in: ['property-a'] });
  } finally {
    Property.find = originalPropertyFind;
    Notification.countDocuments = originalNotificationCount;
  }
});

test('area admin cannot mark another area notification as read', async () => {
  const originalPropertyFind = Property.find;
  const originalNotificationFindOne = Notification.findOne;
  let notificationFilter;
  Property.find = () => createPropertyQuery([{ _id: 'property-a' }]);
  Notification.findOne = async (filter) => {
    notificationFilter = filter;
    return null;
  };
  const response = createResponse();

  try {
    await markNotificationAsRead(
      { user: areaAdmin, params: { id: 'notification-b' } },
      response,
    );

    assert.equal(response.statusCode, 404);
    assert.equal(notificationFilter._id, 'notification-b');
    assert.deepEqual(notificationFilter.property, { $in: ['property-a'] });
  } finally {
    Property.find = originalPropertyFind;
    Notification.findOne = originalNotificationFindOne;
  }
});

test('area admin cannot delete another area notification', async () => {
  const originalPropertyFind = Property.find;
  const originalNotificationFindOne = Notification.findOne;
  let notificationFilter;
  Property.find = () => createPropertyQuery([{ _id: 'property-a' }]);
  Notification.findOne = async (filter) => {
    notificationFilter = filter;
    return null;
  };
  const response = createResponse();

  try {
    await deleteNotification(
      { user: areaAdmin, params: { id: 'notification-b' } },
      response,
    );

    assert.equal(response.statusCode, 404);
    assert.deepEqual(notificationFilter.property, { $in: ['property-a'] });
  } finally {
    Property.find = originalPropertyFind;
    Notification.findOne = originalNotificationFindOne;
  }
});
