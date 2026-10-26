const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Property = require('../models/Property');
const Area = require('../models/Area');
const VerificationRequest = require('../models/VerificationRequest');
const Notification = require('../models/Notification');
const SystemLog = require('../models/SystemLog');
const propertyRoutes = require('../routes/propertyRoutes');
const { areaAdminOnly } = require('../middleware/auth');
const { getPropertyHistory, updateProperty } = require('./propertyController');
const { verifyProperty, rejectProperty } = require('./adminController');

const adminId = '507f1f77bcf86cd799439011';
const propertyId = '507f1f77bcf86cd799439012';
const oldAdminId = '507f1f77bcf86cd799439013';

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

const createAreaAdminQuery = (admin) => ({
  select() {
    return { lean: async () => admin };
  },
});

const createHistoryQuery = (property) => ({
  select: async () => property,
});

const createSelectLeanQuery = (value) => ({
  select() {
    return { lean: async () => value };
  },
});

test('property verification decisions append actor snapshots without replacing earlier decisions', async () => {
  const originals = {
    userFindById: User.findById,
    propertyFindById: Property.findById,
    verificationUpdate: VerificationRequest.findOneAndUpdate,
    notificationCreate: Notification.create,
    systemLogCreate: SystemLog.create,
  };
  const admin = {
    _id: adminId,
    name: 'Admin A',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'Dessie',
  };
  const property = {
    _id: propertyId,
    title: 'Test Property',
    landlord: '507f1f77bcf86cd799439014',
    area: 'Dessie',
    city: 'Dessie',
    history: [],
    async save() {},
    toObject() {
      return { ...this };
    },
  };
  User.findById = () => createSelectLeanQuery(admin);
  Property.findById = async () => property;
  VerificationRequest.findOneAndUpdate = async () => {};
  Notification.create = async () => {};
  SystemLog.create = async () => {};

  try {
    const verifyResponse = createResponse();
    await verifyProperty({ params: { id: propertyId }, user: { id: adminId, role: 'admin' } }, verifyResponse);
    assert.equal(verifyResponse.statusCode, null);
    assert.equal(property.handledByName, 'Admin A');
    assert.equal(property.decision, 'verified');

    admin.name = 'Renamed Admin A';
    const rejectResponse = createResponse();
    await rejectProperty({
      params: { id: propertyId },
      body: { comment: 'Needs a correction' },
      user: { id: adminId, role: 'admin' },
    }, rejectResponse);

    assert.equal(rejectResponse.statusCode, null);
    assert.equal(property.history.length, 2);
    assert.equal(property.history[0].byName, 'Admin A');
    assert.equal(property.history[0].action, 'verified');
    assert.equal(property.history[1].byName, 'Renamed Admin A');
    assert.equal(property.history[1].action, 'rejected');
    assert.equal(property.history[1].note, 'Needs a correction');
  } finally {
    User.findById = originals.userFindById;
    Property.findById = originals.propertyFindById;
    VerificationRequest.findOneAndUpdate = originals.verificationUpdate;
    Notification.create = originals.notificationCreate;
    SystemLog.create = originals.systemLogCreate;
  }
});

test('property history route requires authentication and Area Admin authorization', () => {
  const route = propertyRoutes.stack.find(
    (layer) => layer.route?.path === '/:id/history',
  );

  assert.ok(route);
  assert.equal(route.route.stack[0].handle.name, 'auth');
  assert.equal(route.route.stack[1].handle, areaAdminOnly);
});

test('Area Admin reads newest-first property history using the database-assigned area', async () => {
  const originals = {
    userFindById: User.findById,
    userFind: User.find,
    propertyFindOne: Property.findOne,
  };
  const history = [
    { action: 'verified', byId: oldAdminId, byName: 'Former Area Admin', at: new Date('2026-02-02'), note: '' },
    { action: 'rejected', byId: adminId, byName: 'Current Area Admin', at: new Date('2026-01-02'), note: 'Missing document' },
  ];
  let propertyFilter;
  User.findById = () => createAreaAdminQuery({
    role: 'admin',
    adminType: 'area',
    assignedArea: 'Dessie',
    adminAreas: [{ city: 'Bahirdar' }],
    isActive: true,
  });
  User.find = () => ({
    select: () => ({
      lean: async () => [
        { _id: oldAdminId, role: 'tenant', isActive: true },
        {
          _id: adminId,
          role: 'admin',
          adminType: 'area',
          assignedArea: 'Dessie',
          isActive: true,
        },
      ],
    }),
  });
  Property.findOne = (filter) => {
    propertyFilter = filter;
    return createHistoryQuery({
      _id: propertyId,
      area: 'Dessie',
      city: 'Dessie',
      history,
    });
  };

  try {
    const response = createResponse();
    await getPropertyHistory({
      params: { id: propertyId },
      user: { id: adminId, assignedArea: 'Bahirdar' },
    }, response);

    assert.ok(propertyFilter.$and[0].$or.some((condition) => condition.area?.test('Dessie')));
    assert.equal(propertyFilter.$and[0].$or.some((condition) => condition.area?.test('Bahirdar')), false);
    assert.equal(response.statusCode, null);
    assert.deepEqual(response.body.map((entry) => entry.action), ['verified', 'rejected']);
    assert.equal(response.body[0].byName, 'Former Area Admin');
    assert.equal(response.body[0].isFormerAdmin, true);
    assert.equal(response.body[1].isFormerAdmin, false);
  } finally {
    User.findById = originals.userFindById;
    User.find = originals.userFind;
    Property.findOne = originals.propertyFindOne;
  }
});

test('Area Admin cannot read a property outside the current database-assigned area', async () => {
  const originals = { userFindById: User.findById, propertyFindOne: Property.findOne };
  User.findById = () => createAreaAdminQuery({
    role: 'admin',
    adminType: 'area',
    assignedArea: 'Dessie',
    isActive: true,
  });
  Property.findOne = () => createHistoryQuery(null);

  try {
    const response = createResponse();
    await getPropertyHistory({ params: { id: propertyId }, user: { id: adminId } }, response);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: 'Property not found' });
  } finally {
    User.findById = originals.userFindById;
    Property.findOne = originals.propertyFindOne;
  }
});

test('editing an address recalculates area, logs the change, and preserves verification history', async () => {
  const originals = {
    areaFind: Area.find,
    propertyFindById: Property.findById,
    notificationCreate: Notification.create,
    systemLogCreate: SystemLog.create,
  };
  const history = [{ action: 'verified', byId: adminId, byName: 'Area Admin', at: new Date(), note: '' }];
  const logs = [];
  const property = {
    _id: propertyId,
    landlord: '507f1f77bcf86cd799439014',
    title: 'Verified home',
    description: 'Existing property',
    price: 1000,
    bedrooms: 2,
    area: 'Addis Ababa',
    region: 'Addis Ababa',
    zone: 'Central',
    wereda: 'Bole',
    city: 'Addis Ababa',
    history,
    isVerified: true,
    verificationStatus: 'approved',
    async save() {},
    toObject() { return { ...this }; },
  };
  Area.find = () => ({
    select: () => ({ lean: async () => [{
      name: 'Dessie',
      addressMapping: { region: 'Amhara', zone: 'South Wollo', city: 'Dessie' },
    }] }),
  });
  Property.findById = async () => property;
  Notification.create = async () => {};
  SystemLog.create = async (log) => logs.push(log);

  try {
    const response = createResponse();
    await updateProperty({
      params: { id: propertyId },
      user: { id: property.landlord, role: 'landlord' },
      body: {
        title: property.title,
        description: property.description,
        price: property.price,
        bedrooms: property.bedrooms,
        area: 'Client controlled area',
        region: 'Amhara',
        zone: 'South Wollo',
        wereda: 'Dessie',
        city: 'Dessie',
        subCity: 'Central',
        kebele: '1',
        houseNumber: '1',
      },
      files: {},
    }, response);

    assert.equal(response.statusCode, null);
    assert.equal(property.area, 'Dessie');
    assert.equal(property.isVerified, false);
    assert.equal(property.verificationStatus, 'pending');
    assert.equal(property.history, history);
    assert.equal(property.history.length, 1);
    assert.equal(logs.some((log) => log.action === 'PROPERTY_AREA_CHANGED'
      && log.description.includes('Addis Ababa')
      && log.description.includes('Dessie')), true);
  } finally {
    Area.find = originals.areaFind;
    Property.findById = originals.propertyFindById;
    Notification.create = originals.notificationCreate;
    SystemLog.create = originals.systemLogCreate;
  }
});
