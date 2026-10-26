const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const RentalRequest = require('../models/RentalRequest');
const ContactMessage = require('../models/ContactMessage');
const Notification = require('../models/Notification');
const SystemLog = require('../models/SystemLog');
const Area = require('../models/Area');
const {
  createAdminAccount,
  deleteUser,
  changeUserRole,
  updateAreaAdminAccount,
  deleteAreaAdminAccount,
  setAreaAdminActive,
  getAdminProperties,
} = require('./adminController');
const { getAreaAdminConflict } = require('../utils/areaAdminUniqueness');

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

test('hard-deleting an Area Admin is rejected', async () => {
  const response = createResponse();

  await deleteAreaAdminAccount({ params: { id: 'area-admin-id' } }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.body.message, 'Admins cannot be deleted. Use Demote or Deactivate.');
});

test('generic user deletion also rejects legacy Area Admin role records', async () => {
  const originalFindById = User.findById;
  let documentDeleteCalled = false;
  User.findById = async () => ({
    role: 'area_admin',
    async deleteOne() {
      documentDeleteCalled = true;
    },
  });
  const response = createResponse();

  try {
    await deleteUser({
      params: { id: 'area-admin-id' },
      user: { id: 'platform-admin-id', role: 'admin', adminType: 'platform' },
    }, response);

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, 'Admin accounts must be managed through Admin Management.');
    assert.equal(documentDeleteCalled, false);
  } finally {
    User.findById = originalFindById;
  }
});

const createAreaAdmin = (areaName = 'Bahirdar') => ({
  _id: '507f1f77bcf86cd799439019',
  name: `${areaName} Admin`,
  role: 'admin',
  adminType: 'area',
  assignedArea: areaName,
  adminAreas: [{ city: areaName }],
  isActive: true,
  password: 'password-hash',
  toObject() {
    return {
      _id: this._id,
      name: this.name,
      role: this.role,
      adminType: this.adminType,
      assignedArea: this.assignedArea,
      adminAreas: this.adminAreas,
      isActive: this.isActive,
    };
  },
  async save() {},
});

const queryMatchesArea = (value, areaName) => {
  if (value instanceof RegExp) return value.test(areaName);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((child) => queryMatchesArea(child, areaName));
};

const findAssignmentFilter = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.$or) && value.$or.some((condition) => condition.assignedTo || condition.ownerAdminId)) {
    return value;
  }
  return Object.values(value).map(findAssignmentFilter).find(Boolean) || null;
};

const stubCleanupModels = () => {
  const originals = {
    propertyFind: Property.find,
    propertyUpdate: Property.updateMany,
    verificationUpdate: VerificationRequest.updateMany,
    rentalUpdate: RentalRequest.updateMany,
    messageUpdate: ContactMessage.updateMany,
    notificationUpdate: Notification.updateMany,
  };
  const updates = [];
  const properties = [
    { _id: 'bahirdar-property', area: 'Bahirdar' },
    { _id: 'dessie-property', area: 'Dessie' },
  ];
  Property.find = (filter) => ({
    select: () => ({
      lean: async () => properties.filter((property) => queryMatchesArea(filter, property.area)),
    }),
  });
  for (const [model, key] of [
    [Property, 'propertyUpdate'],
    [VerificationRequest, 'verificationUpdate'],
    [RentalRequest, 'rentalUpdate'],
    [ContactMessage, 'messageUpdate'],
    [Notification, 'notificationUpdate'],
  ]) {
    model.updateMany = async (filter, update) => {
      updates.push({ model: model.modelName, filter, update });
    };
  }
  return {
    updates,
    restore() {
      Property.find = originals.propertyFind;
      Property.updateMany = originals.propertyUpdate;
      VerificationRequest.updateMany = originals.verificationUpdate;
      RentalRequest.updateMany = originals.rentalUpdate;
      ContactMessage.updateMany = originals.messageUpdate;
      Notification.updateMany = originals.notificationUpdate;
    },
  };
};

test('demotion converts the same account to Tenant and logs the former area', async () => {
  const originals = { findById: User.findById, findOne: User.findOne, logCreate: SystemLog.create };
  const admin = createAreaAdmin();
  const cleanup = stubCleanupModels();
  const logs = [];
  User.findById = async () => admin;
  User.findOne = () => ({ select: () => ({ lean: async () => null }) });
  SystemLog.create = async (entry) => { logs.push(entry); return entry; };
  const response = createResponse();

  try {
    await changeUserRole({ params: { id: admin._id }, body: { role: 'tenant' }, ip: '127.0.0.1' }, response);
    assert.equal(response.statusCode, null);
    assert.equal(admin.role, 'tenant');
    assert.equal(admin.adminType, undefined);
    assert.equal(admin.assignedArea, '');
    assert.deepEqual(admin.adminAreas, []);
    assert.ok(cleanup.updates.some(({ model, filter }) => (
      model === 'Property' && filter.verificationStatus === 'pending' && findAssignmentFilter(filter).$or.some((condition) => (
        condition.assignedTo?.$in.includes(admin._id) || condition.ownerAdminId?.$in.includes(admin._id)
      ))
    )));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, 'AREA_ADMIN_DEMOTED');
    assert.match(logs[0].description, /Bahirdar/);
  } finally {
    User.findById = originals.findById;
    User.findOne = originals.findOne;
    SystemLog.create = originals.logCreate;
    cleanup.restore();
  }
});

test('demotion preserves the verified-by snapshot and exposes the former admin in history', async () => {
  const originals = {
    find: User.find,
    findById: User.findById,
    findOne: User.findOne,
    propertyFind: Property.find,
    logCreate: SystemLog.create,
  };
  const admin = createAreaAdmin('North');
  const landlordId = '507f1f77bcf86cd799439020';
  const historicalProperty = {
    _id: '507f1f77bcf86cd799439021',
    landlord: landlordId,
    area: 'North',
    verificationStatus: 'approved',
    isVerified: true,
    decision: 'verified',
    handledBy: admin._id,
    handledByName: admin.name,
    handledByRole: 'area_admin',
    handledAt: new Date('2026-10-01T12:00:00.000Z'),
    history: [{ action: 'verified', byId: admin._id, byName: admin.name }],
  };
  const cleanup = stubCleanupModels();
  User.findById = async () => admin;
  User.findOne = () => ({ select: () => ({ lean: async () => null }) });
  SystemLog.create = async (entry) => entry;
  const demotionResponse = createResponse();

  try {
    await changeUserRole({ params: { id: admin._id }, body: { role: 'tenant' } }, demotionResponse);
    assert.equal(demotionResponse.statusCode, null);
    assert.equal(admin.assignedArea, '');

    User.findById = () => ({ select: () => ({ lean: async () => admin }) });
    User.find = (filter) => ({
      select: () => ({
        lean: async () => (filter.role === 'landlord'
          ? [{ _id: landlordId, name: 'Property Owner', role: 'landlord' }]
          : [admin]),
      }),
    });
    Property.find = () => ({
      sort: () => ({ lean: async () => [historicalProperty] }),
    });
    const historyResponse = createResponse();
    await getAdminProperties({
      user: { id: admin._id },
      query: { status: 'approved' },
      params: {},
    }, historyResponse);

    assert.equal(historyResponse.statusCode, null);
    assert.equal(historyResponse.body[0].handledByName, 'North Admin');
    assert.equal(historyResponse.body[0].handledByIsFormerAdmin, true);
    assert.equal(historyResponse.body[0].history[0].byName, 'North Admin');
    assert.equal(historyResponse.body[0].history[0].byId, admin._id);
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    User.findOne = originals.findOne;
    Property.find = originals.propertyFind;
    SystemLog.create = originals.logCreate;
    cleanup.restore();
  }
});

test('creating an Area Admin for an occupied area returns the required conflict message', async () => {
  const originals = { find: User.find, areaFindOne: Area.findOne };
  const occupiedAdmin = { ...createAreaAdmin('Dessie'), _id: 'occupied-dessie-admin' };
  User.find = () => ({ select: () => ({ lean: async () => [occupiedAdmin] }) });
  Area.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Dessie' }) }) });
  const response = createResponse();

  try {
    await createAdminAccount({
      body: {
        fullName: 'Another Admin',
        email: 'another@example.com',
        username: 'another_admin',
        password: 'temporary-password',
        adminType: 'area',
        area: 'Dessie',
      },
    }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(
      response.body.message,
      'Area Dessie already has an Area Admin (Dessie Admin). Demote or reassign that admin first.',
    );
  } finally {
    User.find = originals.find;
    Area.findOne = originals.areaFindOne;
  }
});

test('editing an Area Admin into an occupied area is rejected without changing the account', async () => {
  const originals = { find: User.find, findById: User.findById, areaFindOne: Area.findOne };
  const admin = { ...createAreaAdmin('Bahirdar'), set(values) { Object.assign(this, values); } };
  const occupiedAdmin = { ...createAreaAdmin('Dessie'), _id: 'occupied-dessie-admin' };
  User.find = () => ({ select: () => ({ lean: async () => [occupiedAdmin] }) });
  User.findById = async () => admin;
  Area.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Dessie' }) }) });
  const response = createResponse();

  try {
    await updateAreaAdminAccount({
      params: { id: admin._id },
      body: { name: admin.name, email: 'admin@example.com', assignedArea: 'Dessie' },
    }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(admin.assignedArea, 'Bahirdar');
    assert.equal(response.body.message, 'Area Dessie already has an Area Admin (Dessie Admin). Demote or reassign that admin first.');
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    Area.findOne = originals.areaFindOne;
  }
});

test('rejects the retired generic User role', async () => {
  const originalFindById = User.findById;
  const response = createResponse();
  User.findById = async () => assert.fail('Invalid role must be rejected before loading an account');

  try {
    await changeUserRole({ params: { id: 'admin-id' }, body: { role: 'user' } }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'Unknown role');
  } finally {
    User.findById = originalFindById;
  }
});

test('demoting one area admin leaves every other area and admin assignment untouched', async () => {
  const originals = { findById: User.findById, findOne: User.findOne, logCreate: SystemLog.create };
  const admin = createAreaAdmin('Dessie');
  const cleanup = stubCleanupModels();
  User.findById = async () => admin;
  User.findOne = () => ({ select: () => ({ lean: async () => null }) });
  SystemLog.create = async (entry) => entry;
  const response = createResponse();

  try {
    await changeUserRole({ params: { id: admin._id }, body: { role: 'tenant' } }, response);

    assert.equal(response.statusCode, null);
    assert.equal(admin.role, 'tenant');
    assert.ok(cleanup.updates.every(({ filter }) => (
      findAssignmentFilter(filter).$or.every((condition) => {
        const [field] = Object.entries(condition)[0];
        return condition[field].$in.every((id) => id === admin._id);
      })
    )));
    const propertyUpdate = cleanup.updates.find(({ model }) => model === 'Property');
    const rentalUpdate = cleanup.updates.find(({ model }) => model === 'RentalRequest');
    const messageUpdate = cleanup.updates.find(({ model }) => model === 'ContactMessage');
    assert.ok(queryMatchesArea(propertyUpdate.filter, 'Dessie'));
    assert.equal(queryMatchesArea(propertyUpdate.filter, 'Bahirdar'), false);
    assert.deepEqual(rentalUpdate.filter.property, { $in: ['dessie-property'] });
    assert.deepEqual(messageUpdate.filter.area, { $in: ['Dessie'] });
  } finally {
    User.findById = originals.findById;
    User.findOne = originals.findOne;
    SystemLog.create = originals.logCreate;
    cleanup.restore();
  }
});

test('transferring one Area Admin releases only their unfinished work in the previous area', async () => {
  const originals = {
    find: User.find,
    findById: User.findById,
    findOne: User.findOne,
    areaFindOne: Area.findOne,
  };
  const admin = {
    ...createAreaAdmin('Dessie'),
    email: 'admin@example.com',
    phone: '',
    set(values) { Object.assign(this, values); },
  };
  const cleanup = stubCleanupModels();
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  User.findById = async () => admin;
  User.findOne = async () => null;
  Area.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Gimba' }) }) });
  const response = createResponse();

  try {
    await updateAreaAdminAccount({
      params: { id: admin._id },
      body: { name: admin.name, email: admin.email, assignedArea: 'Gimba' },
    }, response);

    assert.equal(response.statusCode, null);
    assert.equal(admin.assignedArea, 'Gimba');
    const propertyUpdate = cleanup.updates.find(({ model }) => model === 'Property');
    const rentalUpdate = cleanup.updates.find(({ model }) => model === 'RentalRequest');
    const messageUpdate = cleanup.updates.find(({ model }) => model === 'ContactMessage');
    assert.ok(queryMatchesArea(propertyUpdate.filter, 'Dessie'));
    assert.equal(queryMatchesArea(propertyUpdate.filter, 'Bahirdar'), false);
    assert.deepEqual(rentalUpdate.filter.property, { $in: ['dessie-property'] });
    assert.deepEqual(messageUpdate.filter.area, { $in: ['Dessie'] });
    assert.ok(cleanup.updates.every(({ filter }) => findAssignmentFilter(filter).$or.every((condition) => (
      Object.values(condition)[0].$in.every((id) => id === admin._id)
    ))));
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    User.findOne = originals.findOne;
    Area.findOne = originals.areaFindOne;
    cleanup.restore();
  }
});

test('deactivation marks the account inactive, cleans unfinished references, and logs the action', async () => {
  const originals = { findById: User.findById, logCreate: SystemLog.create };
  const admin = createAreaAdmin();
  const cleanup = stubCleanupModels();
  const logs = [];
  User.findById = async () => admin;
  SystemLog.create = async (entry) => { logs.push(entry); return entry; };
  const response = createResponse();

  try {
    const request = {
      params: { id: admin._id },
      body: { isActive: false },
      ip: '127.0.0.1',
      user: { id: '507f1f77bcf86cd799439021', role: 'admin', adminType: 'platform' },
    };
    await setAreaAdminActive(request, response);
    assert.equal(response.statusCode, null);
    assert.equal(admin.isActive, false);
    assert.ok(cleanup.updates.every(({ update }) => (
      update.$unset.assignedTo === 1 && update.$unset.ownerAdminId === 1
    )));
    assert.equal(admin.assignedArea, 'Bahirdar');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, 'AREA_ADMIN_DEACTIVATED');
    assert.match(logs[0].description, /Bahirdar/);

    const activateResponse = createResponse();
    await setAreaAdminActive({
      ...request,
      body: { isActive: true },
    }, activateResponse);
    assert.equal(activateResponse.statusCode, null);
    assert.equal(admin.isActive, true);
    assert.equal(logs.length, 2);
    assert.equal(logs[1].action, 'AREA_ADMIN_ACTIVATED');
  } finally {
    User.findById = originals.findById;
    SystemLog.create = originals.logCreate;
    cleanup.restore();
  }
});

test('requires confirmation and links an existing same-role account instead of duplicating email', async () => {
  const originals = { findById: User.findById, findOne: User.findOne, logCreate: SystemLog.create };
  const admin = createAreaAdmin();
  const existingTenant = { _id: '507f1f77bcf86cd799439020', role: 'tenant' };
  const cleanup = stubCleanupModels();
  const logs = [];
  User.findById = async () => admin;
  User.findOne = () => ({ select: () => ({ lean: async () => existingTenant }) });
  SystemLog.create = async (entry) => { logs.push(entry); return entry; };
  const response = createResponse();

  try {
    await changeUserRole({ params: { id: admin._id }, body: { role: 'tenant' } }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'EXISTING_ACCOUNT_CONFIRMATION_REQUIRED');
    assert.equal(admin.isActive, true);

    const confirmedResponse = createResponse();
    await changeUserRole({
      params: { id: admin._id },
      body: { role: 'tenant', confirmExistingAccount: true, existingAccountId: existingTenant._id },
    }, confirmedResponse);
    assert.equal(confirmedResponse.statusCode, null);
    assert.equal(admin.isActive, false);
    assert.equal(String(admin.replacedBy), existingTenant._id);
    assert.equal(logs.at(-1).action, 'AREA_ADMIN_LINKED_EXISTING_ACCOUNT');
  } finally {
    User.findById = originals.findById;
    User.findOne = originals.findOne;
    SystemLog.create = originals.logCreate;
    cleanup.restore();
  }
});

test('deactivation disables an Area Admin but retains their area reservation', async () => {
  const originals = { find: User.find, findById: User.findById, logCreate: SystemLog.create };
  const admin = createAreaAdmin();
  const cleanup = stubCleanupModels();
  User.find = () => ({ select: () => ({ lean: async () => [admin] }) });
  User.findById = async () => admin;
  SystemLog.create = async (entry) => entry;
  const response = createResponse();

  try {
    await changeUserRole({
      params: { id: admin._id },
      body: { role: 'deactivate' },
      user: { id: '507f1f77bcf86cd799439022', role: 'admin', adminType: 'platform' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(admin.role, 'admin');
    assert.equal(admin.adminType, 'area');
    assert.equal(admin.isActive, false);
    assert.equal(admin.assignedArea, 'Bahirdar');
    assert.deepEqual(admin.adminAreas, [{ city: 'Bahirdar' }]);
    assert.equal(await getAreaAdminConflict('Bahirdar'), admin);
    assert.equal(response.body.message, 'Area Admin deactivated successfully.');
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    SystemLog.create = originals.logCreate;
    cleanup.restore();
  }
});

test('platform admin cannot be demoted by this endpoint', async () => {
  const originalFindById = User.findById;
  const admin = { ...createAreaAdmin(), adminType: 'platform' };
  User.findById = async () => admin;
  const response = createResponse();

  try {
    await changeUserRole({ params: { id: admin._id }, body: { role: 'tenant' } }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(admin.role, 'admin');
    assert.equal(admin.adminType, 'platform');
  } finally {
    User.findById = originalFindById;
  }
});

test('promotion requires a selected existing area and grants only Area Admin fields', async () => {
  const originals = { find: User.find, findById: User.findById, areaFindOne: Area.findOne };
  const tenant = {
    _id: '507f1f77bcf86cd799439021',
    name: 'Tenant Example',
    role: 'tenant',
    isActive: true,
    adminAreas: [],
    async save() {},
    toObject() { return { _id: this._id, name: this.name, role: this.role, adminType: this.adminType, assignedArea: this.assignedArea }; },
  };
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  User.findById = async () => tenant;
  Area.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Bahirdar' }) }) });
  const response = createResponse();

  try {
    const missingAreaResponse = createResponse();
    await changeUserRole({
      params: { id: tenant._id },
      body: { role: 'area_admin' },
    }, missingAreaResponse);
    assert.equal(missingAreaResponse.statusCode, 400);
    assert.equal(tenant.role, 'tenant');

    await changeUserRole({
      params: { id: tenant._id },
      body: { role: 'area_admin', assignedArea: 'Bahirdar' },
    }, response);
    assert.equal(tenant.role, 'admin');
    assert.equal(tenant.adminType, 'area');
    assert.equal(tenant.assignedArea, 'Bahirdar');
    assert.deepEqual(tenant.adminAreas, [{ city: 'Bahirdar' }]);
    assert.equal(tenant.isActive, true);
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    Area.findOne = originals.areaFindOne;
  }
});

test('promotion to an area occupied by another Area Admin is rejected', async () => {
  const originals = { find: User.find, findById: User.findById, areaFindOne: Area.findOne };
  const tenant = {
    _id: '507f1f77bcf86cd799439022',
    name: 'Tenant Example',
    role: 'tenant',
    async save() { assert.fail('Conflicting promotion must not save'); },
  };
  const occupiedAdmin = createAreaAdmin('Dessie');
  User.find = () => ({ select: () => ({ lean: async () => [occupiedAdmin] }) });
  User.findById = async () => tenant;
  Area.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Dessie' }) }) });
  const response = createResponse();

  try {
    await changeUserRole({
      params: { id: tenant._id },
      body: { role: 'area_admin', assignedArea: 'Dessie' },
    }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.message, 'Area Dessie already has an Area Admin (Dessie Admin). Demote or reassign that admin first.');
    assert.equal(tenant.role, 'tenant');
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    Area.findOne = originals.areaFindOne;
  }
});

test('an Area Admin can be promoted in a different area while another area remains occupied', async () => {
  const originals = { find: User.find, findById: User.findById, areaFindOne: Area.findOne };
  const tenant = {
    _id: '507f1f77bcf86cd799439023',
    name: 'Tenant Example',
    role: 'tenant',
    async save() {},
    toObject() { return { _id: this._id, name: this.name, role: this.role, assignedArea: this.assignedArea }; },
  };
  const occupiedAdmin = createAreaAdmin('Bahirdar');
  User.find = () => ({ select: () => ({ lean: async () => [occupiedAdmin] }) });
  User.findById = async () => tenant;
  Area.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Dessie' }) }) });
  const response = createResponse();

  try {
    await changeUserRole({
      params: { id: tenant._id },
      body: { role: 'area_admin', assignedArea: 'Dessie' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(tenant.assignedArea, 'Dessie');
    assert.equal(await getAreaAdminConflict('Bahirdar'), occupiedAdmin);
    assert.equal(await getAreaAdminConflict('Dessie'), null);
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    Area.findOne = originals.areaFindOne;
  }
});

test('demotion frees the area for a later Area Admin assignment', async () => {
  const originals = { find: User.find, findById: User.findById, findOne: User.findOne, logCreate: SystemLog.create };
  const admin = createAreaAdmin('Dessie');
  const cleanup = stubCleanupModels();
  User.find = () => ({ select: () => ({ lean: async () => [admin] }) });
  User.findById = async () => admin;
  User.findOne = () => ({ select: () => ({ lean: async () => null }) });
  SystemLog.create = async (entry) => entry;
  const response = createResponse();

  try {
    assert.equal(await getAreaAdminConflict('Dessie'), admin);
    await changeUserRole({ params: { id: admin._id }, body: { role: 'tenant' } }, response);
    assert.equal(response.statusCode, null);
    assert.equal(admin.assignedArea, '');
    assert.equal(await getAreaAdminConflict('Dessie'), null);
  } finally {
    User.find = originals.find;
    User.findById = originals.findById;
    User.findOne = originals.findOne;
    SystemLog.create = originals.logCreate;
    cleanup.restore();
  }
});