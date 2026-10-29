const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const UserPermission = require('../models/UserPermission');
const SystemLog = require('../models/SystemLog');
const Area = require('../models/Area');
const { validatePermissionMap } = require('../config/permissionCatalog');
const {
  getAllUsers,
  getUserPermissionDetails,
  updateUserPermissions,
  approveUser,
  rejectUser,
  createAreaAdmin,
} = require('./adminController');

const targetId = '507f1f77bcf86cd799439011';
const adminId = '507f1f77bcf86cd799439012';

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

const withReplacements = async (replacements, callback) => {
  const originals = {};
  for (const [key, replacement] of Object.entries(replacements)) {
    const [modelName, method] = key.split('.');
    const model = { User, UserPermission, SystemLog, Area }[modelName];
    originals[key] = model[method];
    model[method] = replacement;
  }
  try {
    await callback();
  } finally {
    for (const [key, original] of Object.entries(originals)) {
      const [modelName, method] = key.split('.');
      const model = { User, UserPermission, SystemLog, Area }[modelName];
      model[method] = original;
    }
  }
};

const makeUser = (overrides = {}) => ({
  _id: targetId,
  role: 'tenant',
  status: 'active',
  isActive: true,
  async save() {},
  ...overrides,
});

const adminRequest = (body, user = makeUser()) => ({
  params: { id: targetId },
  body,
  user: { id: adminId, role: 'admin', adminType: 'platform' },
  ip: '127.0.0.1',
  targetUser: user,
});

test('permission updates reject unknown keys, locked keys, and invalid dependencies', async () => {
  const user = makeUser({ role: 'admin', adminType: 'area' });
  await withReplacements({ 'User.findById': async () => user }, async () => {
    for (const [role, permissions, expected] of [
      ['tenant', { inventedFeature: true }, /Unknown permission/],
      ['tenant', { dashboard: false }, /always enabled/],
    ]) {
      const response = createResponse();
      await updateUserPermissions({ ...adminRequest({ role, status: 'active', permissions }), params: { id: targetId } }, response);
      assert.equal(response.statusCode, 400);
      assert.match(response.body.message, expected);
    }
  });
  const dependencyResult = validatePermissionMap('area_admin', { allProperties: false });
  assert.match(dependencyResult.error, /pendingProperties requires allProperties/);
});

test('role changes replace the prior permission rows and log the change', async () => {
  const user = makeUser();
  const writes = [];
  const logs = [];
  await withReplacements({
    'User.findById': async () => user,
    'UserPermission.deleteMany': async (filter) => { writes.push({ type: 'delete', filter }); },
    'UserPermission.insertMany': async (rows) => { writes.push({ type: 'insert', rows }); },
    'SystemLog.create': async (entry) => { logs.push(entry); return entry; },
  }, async () => {
    const response = createResponse();
    await updateUserPermissions({
      ...adminRequest({ role: 'landlord', status: 'active', permissions: { rentalRequests: false } }),
      params: { id: targetId },
    }, response);

    assert.equal(response.statusCode, null);
    assert.equal(user.role, 'landlord');
    assert.deepEqual(writes.map((write) => write.type), ['delete', 'insert']);
    assert.equal(writes[0].filter.userId, targetId);
    assert.equal(writes[1].rows.find((row) => row.permissionKey === 'rentalRequests').enabled, false);
    assert.match(logs[0].description, /role: tenant -> landlord/);
    assert.match(logs[0].description, /rentalRequests: true -> false/);
  });
});

test('Platform Admin cannot update their own permissions', async () => {
  const user = makeUser({ role: 'admin', adminType: 'platform' });
  await withReplacements({ 'User.findById': async () => user }, async () => {
    const response = createResponse();
    await updateUserPermissions({
      ...adminRequest({ role: 'tenant', status: 'active', permissions: {} }),
      params: { id: adminId },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, response);
    assert.equal(response.statusCode, 403);
  });
});

test('pending accounts cannot be activated through the ordinary permissions save endpoint', async () => {
  const user = makeUser({ status: 'pending' });
  await withReplacements({ 'User.findById': async () => user }, async () => {
    const response = createResponse();
    await updateUserPermissions({
      ...adminRequest({ role: 'tenant', status: 'active', permissions: {} }),
      params: { id: targetId },
    }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(user.status, 'pending');
  });
});

test('approval saves selected permissions, activates pending users, and audits the status transition', async () => {
  const user = makeUser({ status: 'pending' });
  const logs = [];
  const permissions = { dashboard: true, favorites: true };
  await withReplacements({
    'User.findById': async () => user,
    'UserPermission.bulkWrite': async () => null,
    'UserPermission.deleteMany': async () => null,
    'SystemLog.create': async (entry) => { logs.push(entry); return entry; },
  }, async () => {
    const response = createResponse();
    await approveUser({
      params: { id: targetId },
      body: { role: 'tenant', permissions },
      user: { id: adminId, role: 'admin' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(user.status, 'active');
    assert.equal(user.isActive, true);
    assert.equal(logs[0].action, 'USER_APPROVED');
    assert.equal(logs[0].details.oldStatus, 'pending');
    assert.equal(logs[0].details.newStatus, 'active');
    assert.equal(logs[0].details.changedBy, 'System');
    assert.match(response.body.message, /permissions saved/);
  });
});

test('rejection marks pending users rejected and writes an audit entry', async () => {
  const user = makeUser({ role: 'admin', adminType: 'area', status: 'pending' });
  const logs = [];
  await withReplacements({
    'User.findById': async () => user,
    'SystemLog.create': async (entry) => { logs.push(entry); return entry; },
  }, async () => {
    const response = createResponse();
    await rejectUser({
      params: { id: targetId },
      user: { id: adminId, name: 'Platform Admin', role: 'admin' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(user.status, 'rejected');
    assert.equal(user.isActive, false);
    assert.equal(logs[0].action, 'USER_REJECTED');
    assert.equal(logs[0].details.oldStatus, 'pending');
    assert.equal(logs[0].details.newStatus, 'rejected');
    assert.equal(logs[0].details.changedBy, 'Platform Admin');
    assert.ok(logs[0].details.timestamp);
  });
});

test('area-admin endpoint creates a pending area admin from the short payload', async () => {
  let createdAdmin;
  await withReplacements({
    'User.findOne': async () => null,
    'User.find': () => ({ select: () => ({ lean: async () => [] }) }),
    'User.create': async (data) => {
      createdAdmin = { ...data, _id: targetId, toObject() { return { ...this }; } };
      return createdAdmin;
    },
    'Area.findOne': () => ({ select: () => ({ lean: async () => ({ name: 'North' }) }) }),
    'SystemLog.create': async (entry) => entry,
  }, async () => {
    const response = createResponse();
    await createAreaAdmin({
      body: { name: 'Area Admin', email: 'area@example.com', tempPassword: 'temporary-pass', area: 'North' },
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(createdAdmin.adminType, 'area');
    assert.equal(createdAdmin.status, 'pending');
    assert.equal(createdAdmin.assignedArea, 'North');
    assert.equal(createdAdmin.role, 'admin');
  });
});

test('pending user listing applies the status filter and is unavailable to Area Admins', async () => {
  let userFilter;
  await withReplacements({
    'User.find': (filter) => {
      userFilter = filter;
      return { select: () => ({ lean: async () => [{ _id: targetId, role: 'admin', status: 'pending' }] }) };
    },
  }, async () => {
    const response = createResponse();
    await getAllUsers({
      query: { status: 'pending' },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, response);
    assert.equal(userFilter.status, 'pending');
    assert.equal(response.body[0].status, 'pending');

    let areaLookupCalled = false;
    User.find = () => { areaLookupCalled = true; throw new Error('must not query pending list'); };
    const denied = createResponse();
    await getAllUsers({
      query: { status: 'pending' },
      user: { id: adminId, role: 'admin', adminType: 'area' },
    }, denied);
    assert.equal(denied.statusCode, 403);
    assert.equal(areaLookupCalled, false);
  });
});

test('permission details return the target role, status, and boolean catalog entries', async () => {
  const user = makeUser({ status: 'suspended' });
  await withReplacements({
    'User.findById': () => ({ select: () => ({ lean: async () => user }) }),
  }, async () => {
    const response = createResponse();
    await getUserPermissionDetails({ params: { id: targetId } }, response);
    assert.equal(response.body.role, 'tenant');
    assert.equal(response.body.status, 'suspended');
    assert.ok(response.body.catalog.every((item) => typeof item.permissionKey === 'string'
      && typeof item.enabled === 'boolean'));
    assert.equal(response.body.permissions.dashboard, true);
  });
});

test('an assigned tenant can be promoted through permission update with a new role catalog', async () => {
  const user = makeUser({ area: 'North' });
  const writes = [];
  await withReplacements({
    'User.findById': async () => user,
    'User.find': () => ({ select: () => ({ lean: async () => [] }) }),
    'Area.findOne': () => ({ select: () => ({ lean: async () => ({ name: 'North' }) }) }),
    'UserPermission.deleteMany': async (filter) => { writes.push({ type: 'delete', filter }); },
    'UserPermission.insertMany': async (rows) => { writes.push({ type: 'insert', rows }); },
    'SystemLog.create': async () => null,
  }, async () => {
    const response = createResponse();
    await updateUserPermissions({
      ...adminRequest({ role: 'area_admin', status: 'active', permissions: { rentalRequests: false } }),
      params: { id: targetId },
    }, response);

    assert.equal(response.statusCode, null);
    assert.equal(user.role, 'admin');
    assert.equal(user.adminType, 'area');
    assert.equal(user.assignedArea, 'North');
    assert.deepEqual(writes.map((write) => write.type), ['delete', 'insert']);
    assert.equal(writes[1].rows.find((row) => row.permissionKey === 'rentalRequests').enabled, false);
  });
});