const test = require('node:test');
const assert = require('node:assert/strict');
const Notification = require('../models/Notification');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const User = require('../models/User');
const {
  getAdminNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearReadNotifications,
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

const createUserQuery = (user = {
  _id: 'area-admin-id',
  role: 'admin',
  adminType: 'area',
  adminAreas: [{ city: 'Mekelle' }],
  isActive: true,
}) => ({
  select() { return this; },
  lean: async () => user,
});

test('area-admin unread notification count is limited to DB-assigned property IDs', async () => {
  const originals = {
    propertyFind: Property.find,
    userFindById: User.findById,
    notificationCount: Notification.countDocuments,
  };
  let notificationFilter;
  Property.find = () => createPropertyQuery([{ _id: 'property-a' }]);
  User.findById = () => createUserQuery();
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
    Property.find = originals.propertyFind;
    User.findById = originals.userFindById;
    Notification.countDocuments = originals.notificationCount;
  }
});

test('area admin cannot mark another area notification as read', async () => {
  const originals = {
    propertyFind: Property.find,
    userFindById: User.findById,
    notificationFindOne: Notification.findOne,
  };
  let notificationFilter;
  Property.find = () => createPropertyQuery([{ _id: 'property-a' }]);
  User.findById = () => createUserQuery();
  Notification.findOne = async (filter) => {
    notificationFilter = filter;
    return null;
  };
  const response = createResponse();

  try {
    await markNotificationAsRead({ user: areaAdmin, params: { id: 'notification-b' } }, response);
    assert.equal(response.statusCode, 404);
    assert.equal(notificationFilter._id, 'notification-b');
    assert.deepEqual(notificationFilter.property, { $in: ['property-a'] });
  } finally {
    Property.find = originals.propertyFind;
    User.findById = originals.userFindById;
    Notification.findOne = originals.notificationFindOne;
  }
});

test('area admin cannot delete another area notification', async () => {
  const originals = {
    propertyFind: Property.find,
    userFindById: User.findById,
    notificationFindOne: Notification.findOne,
  };
  let notificationFilter;
  Property.find = () => createPropertyQuery([{ _id: 'property-a' }]);
  User.findById = () => createUserQuery();
  Notification.findOne = async (filter) => {
    notificationFilter = filter;
    return null;
  };
  const response = createResponse();

  try {
    await deleteNotification({ user: areaAdmin, params: { id: 'notification-b' } }, response);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(notificationFilter.property, { $in: ['property-a'] });
  } finally {
    Property.find = originals.propertyFind;
    User.findById = originals.userFindById;
    Notification.findOne = originals.notificationFindOne;
  }
});

test('admin notifications are filtered and paginated using the current DB area assignment', async () => {
  const originals = {
    propertyFind: Property.find,
    rentalFind: RentalRequest.find,
    notificationFind: Notification.find,
    notificationCount: Notification.countDocuments,
    userFindById: User.findById,
  };
  let listFilter;
  let skipValue;
  let limitValue;
  const returnedNotifications = [{
    _id: 'notification-2',
    property: { _id: 'property-b', title: 'Rental Home' },
    rentalRequest: { _id: 'rental-request-b' },
    propertyTitle: 'Rental Home',
    message: 'New rental request. token=very-secret-value',
    instructions: 'Authorization: Bearer abc.def.ghi',
    type: 'pending',
    read: false,
    createdAt: new Date('2026-10-27T09:00:00Z'),
    password: 'should-not-be-returned',
  }];
  User.findById = () => createUserQuery({
    _id: 'area-admin-id',
    role: 'admin',
    adminType: 'area',
    adminAreas: [{ city: 'Dessie' }],
    isActive: true,
  });
  Property.find = (filter) => {
    if (filter.verificationStatus) return createPropertyQuery([]);
    assert.equal(filter.$or[0].areaKey, 'dessie');
    assert.ok(filter.$or[1].area.test('Dessie'));
    return createPropertyQuery([{ _id: 'property-b' }]);
  };
  RentalRequest.find = () => ({
    populate() { return this; },
    select() { return this; },
    lean: async () => [],
  });
  Notification.find = (filter) => {
    if (filter.rentalRequest?.$in) return { select() { return this; }, lean: async () => [] };
    listFilter = filter;
    return {
      populate() { return this; },
      sort() { return this; },
      skip(value) { skipValue = value; return this; },
      limit(value) { limitValue = value; return this; },
      lean: async () => returnedNotifications,
    };
  };
  Notification.countDocuments = async (filter) => {
    if (filter.type?.$in) return filter.read === false ? 3 : 7;
    if (filter.type === 'info') return filter.read === false ? 2 : 4;
    if (filter.rentalRequest?.$exists) return filter.read === false ? 5 : 8;
    if (filter._id?.$in) return 0;
    if (filter.rentalRequest === null) return 0;
    if (filter.read === false) return 10;
    return 17;
  };
  const response = createResponse();

  try {
    await getAdminNotifications({
      user: areaAdmin,
      query: { page: '2', limit: '1', type: 'rentals', unread: 'true' },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(listFilter.recipientRole, 'admin');
    assert.deepEqual(listFilter.property, { $in: ['property-b'] });
    assert.equal(listFilter.read, false);
    assert.equal(listFilter.rentalRequest.$exists, true);
    assert.equal(skipValue, 1);
    assert.equal(limitValue, 1);
    assert.equal(response.body.pagination.page, 2);
    assert.equal(response.body.pagination.limit, 1);
    assert.equal(response.body.pagination.total, 5);
    assert.equal(response.body.unreadCount, 10);
    assert.equal(response.body.totals.byType.properties.total, 7);
    assert.equal(response.body.totals.byType.rentals.unread, 5);
    assert.equal(response.body.notifications[0].category, 'rentals');
    assert.doesNotMatch(JSON.stringify(response.body), /very-secret-value|abc\.def\.ghi|should-not-be-returned|password:/i);
  } finally {
    Property.find = originals.propertyFind;
    RentalRequest.find = originals.rentalFind;
    Notification.find = originals.notificationFind;
    Notification.countDocuments = originals.notificationCount;
    User.findById = originals.userFindById;
  }
});

test('platform-admin notifications are not filtered to a property area', async () => {
  const originals = {
    propertyFind: Property.find,
    rentalFind: RentalRequest.find,
    notificationFind: Notification.find,
    notificationCount: Notification.countDocuments,
    userFindById: User.findById,
  };
  let pendingPropertyFilter;
  let notificationFilter;
  User.findById = () => createUserQuery({
    _id: 'platform-admin-id',
    role: 'admin',
    adminType: 'platform',
    adminAreas: [],
    isActive: true,
  });
  Property.find = (filter) => {
    pendingPropertyFilter = filter;
    return createPropertyQuery([]);
  };
  RentalRequest.find = () => ({
    populate() { return this; },
    select() { return this; },
    lean: async () => [],
  });
  Notification.find = (filter) => {
    if (filter.rentalRequest?.$in) return { select() { return this; }, lean: async () => [] };
    notificationFilter = filter;
    return {
      populate() { return this; },
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      lean: async () => [],
    };
  };
  Notification.countDocuments = async () => 0;
  const response = createResponse();

  try {
    await getAdminNotifications({ user: { id: 'platform-admin-id', role: 'admin' }, query: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(pendingPropertyFilter, { isVerified: false, verificationStatus: 'pending' });
    assert.equal(notificationFilter.recipientRole, 'admin');
    assert.equal(Object.prototype.hasOwnProperty.call(notificationFilter, 'property'), false);
  } finally {
    Property.find = originals.propertyFind;
    RentalRequest.find = originals.rentalFind;
    Notification.find = originals.notificationFind;
    Notification.countDocuments = originals.notificationCount;
    User.findById = originals.userFindById;
  }
});

test('mark-read, mark-all, and clear-read mutate only the area assigned in the database', async () => {
  const originals = {
    propertyFind: Property.find,
    userFindById: User.findById,
    notificationFindOne: Notification.findOne,
    notificationUpdateMany: Notification.updateMany,
    notificationDeleteMany: Notification.deleteMany,
  };
  const filters = [];
  User.findById = () => createUserQuery({
    _id: 'area-admin-id',
    role: 'admin',
    adminType: 'area',
    adminAreas: [{ city: 'Current DB Area' }],
    isActive: true,
  });
  Property.find = () => createPropertyQuery([{ _id: 'current-area-property' }]);
  Notification.findOne = async (filter) => {
    filters.push(filter);
    return {
      _id: 'notification-a',
      recipientRole: 'admin',
      property: { _id: 'current-area-property', title: 'Current Property' },
      propertyTitle: 'Current Property',
      message: 'Property awaiting review',
      type: 'pending',
      read: false,
      async save() { this.read = true; },
    };
  };
  Notification.updateMany = async (filter) => {
    filters.push(filter);
    return { modifiedCount: 2 };
  };
  Notification.deleteMany = async (filter) => {
    filters.push(filter);
    return { deletedCount: 3 };
  };
  const readResponse = createResponse();
  const readAllResponse = createResponse();
  const clearResponse = createResponse();

  try {
    await markNotificationAsRead({ user: areaAdmin, params: { id: 'notification-a' } }, readResponse);
    await markAllNotificationsAsRead({ user: areaAdmin }, readAllResponse);
    await clearReadNotifications({ user: areaAdmin }, clearResponse);
    assert.equal(readResponse.statusCode, 200);
    assert.equal(readResponse.body.notification.read, true);
    assert.equal(readAllResponse.statusCode, 200);
    assert.equal(clearResponse.statusCode, 200);
    assert.equal(clearResponse.body.deletedCount, 3);
    filters.forEach((filter) => {
      assert.deepEqual(filter.property, { $in: ['current-area-property'] });
      assert.equal(filter.recipientRole, 'admin');
    });
  } finally {
    Property.find = originals.propertyFind;
    User.findById = originals.userFindById;
    Notification.findOne = originals.notificationFindOne;
    Notification.updateMany = originals.notificationUpdateMany;
    Notification.deleteMany = originals.notificationDeleteMany;
  }
});
