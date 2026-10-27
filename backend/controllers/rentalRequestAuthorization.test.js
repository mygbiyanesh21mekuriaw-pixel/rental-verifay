const test = require('node:test');
const assert = require('node:assert/strict');
const RentRequest = require('../models/RentalRequest');
const Property = require('../models/Property');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SystemLog = require('../models/SystemLog');
const {
  getLandlordRentalRequests,
  landlordRespondToRequest,
  getAdminRentalRequests,
  getMyRentalRequestById,
  adminRespondToRentalRequest,
} = require('./rentalRequestController');

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

const withAdminRentalMocks = async (mocks, callback) => {
  const originals = {
    userFindById: User.findById,
    propertyFind: Property.find,
    propertyFindOneAndUpdate: Property.findOneAndUpdate,
    rentalFind: RentRequest.find,
    rentalFindById: RentRequest.findById,
    rentalExists: RentRequest.exists,
    notificationCreate: Notification.create,
    systemLogCreate: SystemLog.create,
  };
  User.findById = mocks.userFindById || originals.userFindById;
  Property.find = mocks.propertyFind || originals.propertyFind;
  Property.findOneAndUpdate = mocks.propertyFindOneAndUpdate || originals.propertyFindOneAndUpdate;
  RentRequest.find = mocks.rentalFind || originals.rentalFind;
  RentRequest.findById = mocks.rentalFindById || originals.rentalFindById;
  RentRequest.exists = mocks.rentalExists || originals.rentalExists;
  Notification.create = mocks.notificationCreate || originals.notificationCreate;
  SystemLog.create = mocks.systemLogCreate || originals.systemLogCreate;
  try {
    await callback();
  } finally {
    User.findById = originals.userFindById;
    Property.find = originals.propertyFind;
    Property.findOneAndUpdate = originals.propertyFindOneAndUpdate;
    RentRequest.find = originals.rentalFind;
    RentRequest.findById = originals.rentalFindById;
    RentRequest.exists = originals.rentalExists;
    Notification.create = originals.notificationCreate;
    SystemLog.create = originals.systemLogCreate;
  }
};

const queryValue = (value) => ({
  select() { return this; },
  lean: async () => value,
});

const adminRentalRequest = (propertyArea) => ({
  _id: 'request-id',
  status: 'pending',
  property: {
    _id: 'property-id',
    title: 'Addis rental',
    area: propertyArea,
    availabilityStatus: 'available',
    rentedBy: null,
  },
  tenant: { _id: 'tenant-id', name: 'Tenant', email: 'tenant@example.test' },
  landlord: { _id: 'landlord-id', name: 'Landlord', email: 'landlord@example.test' },
  history: [],
  save: async () => {},
});

test('Area Admin rental-request list uses the admin current area and returns the property area', async () => {
  const captured = {};
  const property = { _id: '507f1f77bcf86cd799439011' };
  const request = {
    property: { _id: property._id, area: 'addisababa', title: 'Addis rental' },
    history: [],
    toObject() {
      return { ...this, property: { ...this.property }, history: [] };
    },
  };
  await withAdminRentalMocks({
    userFindById: () => queryValue({
      role: 'admin',
      adminType: 'area',
      isActive: true,
      assignedArea: 'Addis Ababa',
    }),
    propertyFind: (filter) => {
      captured.propertyFilter = filter;
      return { select: () => ({ lean: async () => [property] }) };
    },
    rentalFind: (filter) => {
      captured.requestFilter = filter;
      return {
        populate(path, selection) {
          if (path === 'property') captured.propertySelection = selection;
          return this;
        },
        sort() { return Promise.resolve([request]); },
      };
    },
  }, async () => {
    const response = createResponse();
    await getAdminRentalRequests({ user: { id: 'admin-id' } }, response);
    assert.equal(captured.propertyFilter.$or[0].areaKey, 'addisababa');
    assert.equal(captured.propertyFilter.$or[1].area.test('addisababa'), true);
    assert.deepEqual(captured.requestFilter, { property: { $in: [property._id] } });
    assert.match(captured.propertySelection, /\barea\b/);
    assert.equal(response.body[0].property.area, 'addisababa');
  });
});

test('rental-request details include the linked property area', async () => {
  const originalFindOne = RentRequest.findOne;
  let propertySelection = '';
  RentRequest.findOne = () => ({
    populate(path, selection) {
      if (path === 'property') propertySelection = selection;
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({
        property: { area: 'Addis Ababa', areaKey: 'addisababa' },
      }).then(resolve, reject);
    },
  });
  try {
    const response = createResponse();
    await getMyRentalRequestById({
      params: { id: 'request-id' },
      user: { id: 'tenant-id' },
    }, response);
    assert.match(propertySelection, /\barea\b/);
    assert.equal(response.body.property.area, 'Addis Ababa');
  } finally {
    RentRequest.findOne = originalFindOne;
  }
});

test('Addis Area Admin can approve and reject rental requests regardless of legacy area spelling', async () => {
  const admin = {
    _id: 'admin-id',
    name: 'Area Admin',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'Addis Ababa',
    isActive: true,
  };
  for (const [area, status] of [
    ['Addis Ababa', 'approved'],
    ['addisababa', 'rejected'],
    ['addis ababa', 'approved'],
  ]) {
    const request = adminRentalRequest(area);
    const captured = { propertySelection: '' };
    await withAdminRentalMocks({
      userFindById: () => queryValue(admin),
      rentalFindById: () => ({
        populate(path, selection) {
          if (path === 'property') captured.propertySelection = selection;
          return this;
        },
        then(resolve, reject) { return Promise.resolve(request).then(resolve, reject); },
      }),
      rentalExists: async () => false,
      propertyFindOneAndUpdate: async () => ({}),
      notificationCreate: async () => ({}),
      systemLogCreate: async () => ({}),
    }, async () => {
      const response = createResponse();
      await adminRespondToRentalRequest({
        params: { id: request._id },
        body: { status },
        user: { id: admin._id, name: admin.name, email: 'admin@example.test', role: 'admin' },
      }, response);
      assert.equal(response.statusCode, null, `${area} should be authorized`);
      assert.equal(request.status, status);
      assert.match(captured.propertySelection, /\barea\b/);
    });
  }
});

test('Area Admin for another area cannot approve or reject an Addis rental request', async () => {
  const request = adminRentalRequest('Addis Ababa');
  await withAdminRentalMocks({
    userFindById: () => queryValue({
      role: 'admin',
      adminType: 'area',
      isActive: true,
      assignedArea: 'Bahirdar',
    }),
    rentalFindById: () => ({
      populate() { return this; },
      then(resolve, reject) { return Promise.resolve(request).then(resolve, reject); },
    }),
  }, async () => {
    const response = createResponse();
    await adminRespondToRentalRequest({
      params: { id: request._id },
      body: { status: 'approved' },
      user: { id: 'other-admin' },
    }, response);
    assert.equal(response.statusCode, 403);
    assert.match(response.body.message, /outside your assigned admin area/);
    assert.equal(request.status, 'pending');
  });
});

test('landlord response accepts only approved or rejected status values', async () => {
  const originalFindById = RentRequest.findById;
  RentRequest.findById = () => {
    throw new Error('A request must not be loaded for an invalid status');
  };
  const response = createResponse();

  try {
    await landlordRespondToRequest({
      params: { id: '507f1f77bcf86cd799439011' },
      body: { status: 'confirmed', landlord: 'another-user' },
      user: { id: '507f1f77bcf86cd799439012', role: 'landlord' },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /Status must be approved or rejected/);
  } finally {
    RentRequest.findById = originalFindById;
  }
});

test('landlord rental requests can be limited while remaining sorted newest first', async () => {
  const originalFind = RentRequest.find;
  const calls = { filter: null, sort: null, limit: null };
  const query = {
    populate() {
      return this;
    },
    sort(sort) {
      calls.sort = sort;
      return this;
    },
    limit(limit) {
      calls.limit = limit;
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve([{ _id: 'newest-request' }]).then(resolve, reject);
    },
  };
  RentRequest.find = (filter) => {
    calls.filter = filter;
    return query;
  };
  const response = createResponse();

  try {
    await getLandlordRentalRequests({
      query: { limit: '5' },
      user: { id: '507f1f77bcf86cd799439012' },
    }, response);

    assert.deepEqual(calls.filter, { landlord: '507f1f77bcf86cd799439012' });
    assert.deepEqual(calls.sort, { createdAt: -1 });
    assert.equal(calls.limit, 5);
    assert.deepEqual(response.body, [{ _id: 'newest-request' }]);
  } finally {
    RentRequest.find = originalFind;
  }
});

test('landlord rental request limit must be a positive integer', async () => {
  const originalFind = RentRequest.find;
  RentRequest.find = () => {
    throw new Error('Requests must not be loaded for an invalid limit');
  };
  const response = createResponse();

  try {
    await getLandlordRentalRequests({
      query: { limit: '0' },
      user: { id: '507f1f77bcf86cd799439012' },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'Limit must be a positive integer');
  } finally {
    RentRequest.find = originalFind;
  }
});
