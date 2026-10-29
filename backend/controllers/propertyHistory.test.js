const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Property = require('../models/Property');
const Area = require('../models/Area');
const SystemSettings = require('../models/SystemSettings');
const VerificationRequest = require('../models/VerificationRequest');
const Notification = require('../models/Notification');
const SystemLog = require('../models/SystemLog');
const propertyRoutes = require('../routes/propertyRoutes');
const { areaAdminOnly } = require('../middleware/auth');
const { getPropertyById, getPropertyHistory, updateProperty } = require('./propertyController');
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
  let landlordNotification;
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
  Notification.create = async (notification) => {
    landlordNotification = notification;
  };
  SystemLog.create = async () => {};

  try {
    const verifyResponse = createResponse();
    await verifyProperty({ params: { id: propertyId }, user: { id: adminId, role: 'admin' } }, verifyResponse);
    assert.equal(verifyResponse.statusCode, null);
    assert.equal(property.handledByName, 'Admin A');
    assert.equal(property.decision, 'verified');

    admin.name = 'Renamed Admin A';
    const invalidReasonResponse = createResponse();
    await rejectProperty({
      params: { id: propertyId },
      body: { reason: '   ' },
      user: { id: adminId, role: 'admin' },
    }, invalidReasonResponse);
    assert.equal(invalidReasonResponse.statusCode, 400);
    assert.match(invalidReasonResponse.body.message, /10 and 500/);
    assert.equal(property.history.length, 1);

    const oversizedReasonResponse = createResponse();
    await rejectProperty({
      params: { id: propertyId },
      body: { reason: 'x'.repeat(501) },
      user: { id: adminId, role: 'admin' },
    }, oversizedReasonResponse);
    assert.equal(oversizedReasonResponse.statusCode, 400);
    assert.equal(property.history.length, 1);

    const rejectResponse = createResponse();
    await rejectProperty({
      params: { id: propertyId },
      body: { reason: '  Needs a correction  ' },
      user: { id: adminId, role: 'admin' },
    }, rejectResponse);

    assert.equal(rejectResponse.statusCode, null);
    assert.equal(property.history.length, 2);
    assert.equal(property.history[0].byName, 'Admin A');
    assert.equal(property.history[0].action, 'verified');
    assert.equal(property.history[1].byName, 'Renamed Admin A');
    assert.equal(property.history[1].action, 'rejected');
    assert.equal(property.history[1].note, 'Needs a correction');
    assert.equal(property.rejectionReason, 'Needs a correction');
    assert.ok(property.rejectedAt instanceof Date);
    assert.equal(property.history[1].byName, 'Renamed Admin A');
    assert.match(landlordNotification.message, /Needs a correction/);
    assert.equal(landlordNotification.instructions, 'Needs a correction');
  } finally {
    User.findById = originals.userFindById;
    Property.findById = originals.propertyFindById;
    VerificationRequest.findOneAndUpdate = originals.verificationUpdate;
    Notification.create = originals.notificationCreate;
    SystemLog.create = originals.systemLogCreate;
  }
});

test('landlords can read rejection details only for their own property', async () => {
  const originals = {
    settingsFindOne: SystemSettings.findOne,
    propertyFindById: Property.findById,
  };
  const property = {
    _id: propertyId,
    title: 'Rejected property',
    landlord: '507f1f77bcf86cd799439014',
    verificationStatus: 'rejected',
    rejectionReason: 'Needs a clearer address',
    rejectedAt: new Date('2026-03-01T10:00:00.000Z'),
    history: [{
      action: 'rejected',
      byName: 'Area Admin',
      note: 'Needs a clearer address',
      at: new Date('2026-03-01T10:00:00.000Z'),
    }],
    toObject() {
      return { ...this };
    },
  };
  SystemSettings.findOne = () => ({
    select: () => ({ lean: async () => ({ properties: { requireAdminReview: true } }) }),
  });
  Property.findById = () => ({
    populate: async () => property,
  });

  try {
    const ownerResponse = createResponse();
    await getPropertyById({
      params: { id: propertyId },
      user: { id: property.landlord, role: 'landlord' },
    }, ownerResponse);
    assert.equal(ownerResponse.body.rejectionReason, 'Needs a clearer address');
    assert.equal(ownerResponse.body.rejectedByName, 'Area Admin');

    const otherLandlordResponse = createResponse();
    await getPropertyById({
      params: { id: propertyId },
      user: { id: '507f1f77bcf86cd799439099', role: 'landlord' },
    }, otherLandlordResponse);
    assert.equal(otherLandlordResponse.statusCode, 404);
    assert.equal(otherLandlordResponse.body.rejectionReason, undefined);

    property.verificationStatus = 'approved';
    property.isVerified = true;
    property.rejectionNote = 'Private historical note';
    const publicResponse = createResponse();
    await getPropertyById({
      params: { id: propertyId },
      user: { id: '507f1f77bcf86cd799439099', role: 'landlord' },
    }, publicResponse);
    assert.equal(publicResponse.body.rejectionReason, undefined);
    assert.equal(publicResponse.body.rejectionNote, undefined);
    assert.equal(publicResponse.body.rejectionNotes, undefined);
  } finally {
    SystemSettings.findOne = originals.settingsFindOne;
    Property.findById = originals.propertyFindById;
  }
});

test('resubmitting a rejected property clears active rejection fields and preserves its history', async () => {
  const originals = {
    areaFind: Area.find,
    propertyFindById: Property.findById,
    notificationCreate: Notification.create,
    systemLogCreate: SystemLog.create,
  };
  const property = {
    _id: propertyId,
    title: 'Rejected property',
    description: 'Existing description',
    price: 18000,
    bedrooms: 2,
    landlord: '507f1f77bcf86cd799439014',
    region: 'Amhara',
    zone: 'South Wollo',
    wereda: 'Dessie',
    city: 'Dessie',
    subCity: 'Dessie',
    kebele: '01',
    houseNumber: '10',
    area: 'Dessie',
    verificationStatus: 'rejected',
    decision: 'rejected',
    isVerified: false,
    rejectionReason: 'Needs a clearer address',
    rejectedAt: new Date('2026-03-01T10:00:00.000Z'),
    history: [{
      action: 'rejected',
      byName: 'Area Admin',
      note: 'Needs a clearer address',
      at: new Date('2026-03-01T10:00:00.000Z'),
    }],
    async save() {},
    toObject() {
      return { ...this };
    },
  };
  Area.find = () => ({ select: () => ({ lean: async () => [] }) });
  Property.findById = async () => property;
  Notification.create = async () => {};
  SystemLog.create = async () => {};

  try {
    const response = createResponse();
    await updateProperty({
      params: { id: propertyId },
      user: { id: property.landlord, role: 'landlord' },
      body: {
        title: 'Updated property',
        description: 'Updated description',
        price: 19000,
        bedrooms: 3,
        region: 'Amhara',
        zone: 'South Wollo',
        wereda: 'Dessie',
        city: 'Dessie',
        subCity: 'Dessie',
        kebele: '01',
        houseNumber: '10',
      },
    }, response);

    assert.equal(property.verificationStatus, 'pending');
    assert.equal(property.rejectionReason, '');
    assert.equal(property.rejectedAt, null);
    assert.equal(property.history.length, 1);
    assert.equal(property.history[0].note, 'Needs a clearer address');
    assert.equal(response.body.property.rejectionReason, '');
    assert.equal(response.body.property.rejectedByName, '');
  } finally {
    Area.find = originals.areaFind;
    Property.findById = originals.propertyFindById;
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

    assert.ok(propertyFilter.$and[0].$or.some((condition) => condition.areaKey === 'dessie'));
    assert.ok(propertyFilter.$and[0].$or.some((condition) => condition.area?.test('Dessie')));
    assert.equal(propertyFilter.$and[0].$or.some((condition) => condition.areaKey === 'bahirdar'), false);
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
