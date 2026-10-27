const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const Payment = require('../models/Payment');
const SystemLog = require('../models/SystemLog');
const { deleteUser, setUserActive, changeUserRole } = require('./adminController');

const userId = '507f1f77bcf86cd799439011';
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

const makeUser = (overrides = {}) => ({
  _id: userId,
  name: 'Example Tenant',
  role: 'tenant',
  isActive: true,
  async save() {},
  async deleteOne() {},
  ...overrides,
});

const withReplacements = async (replacements, callback) => {
  const originals = {};
  Object.entries(replacements).forEach(([key, value]) => {
    const [modelName, method] = key.split('.');
    const model = { User, Property, RentalRequest, Payment, SystemLog }[modelName];
    originals[key] = model[method];
    model[method] = value;
  });
  try {
    await callback();
  } finally {
    Object.entries(originals).forEach(([key, value]) => {
      const [modelName, method] = key.split('.');
      const model = { User, Property, RentalRequest, Payment, SystemLog }[modelName];
      model[method] = value;
    });
  }
};

const zeroDeleteCounts = {
  'Property.countDocuments': async () => 0,
  'Property.find': () => ({
    select: () => ({ lean: async () => [] }),
  }),
  'RentalRequest.find': () => ({
    select: () => ({ lean: async () => [] }),
  }),
  'Payment.countDocuments': async () => 0,
};

test('Area Admin cannot delete a user', async () => {
  await withReplacements({
    'User.findById': async () => assert.fail('Area Admin delete must be rejected before looking up the target'),
  }, async () => {
    const response = createResponse();
    await deleteUser({
      params: { id: userId },
      user: { id: adminId, role: 'admin', adminType: 'area' },
    }, response);

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, 'Area Admins cannot delete users.');
  });
});

test('Platform Admin deletion is blocked with counts and a Deactivate suggestion when records exist', async () => {
  const user = makeUser();
  let userDeleteCalled = false;
  await withReplacements({
    'User.findById': async () => user,
    'Property.countDocuments': async () => 2,
    'Property.find': () => ({
      select: () => ({ lean: async () => [] }),
    }),
    'RentalRequest.find': () => ({
      select: () => ({ lean: async () => [{ property: 'active-rental-property' }] }),
    }),
    'Payment.countDocuments': async () => 3,
  }, async () => {
    user.deleteOne = async () => { userDeleteCalled = true; };
    const response = createResponse();
    await deleteUser({
      params: { id: userId },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, response);

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body.counts, { properties: 2, activeRentals: 1, payments: 3 });
    assert.equal(response.body.suggestion, 'Deactivate');
    assert.match(response.body.message, /Deactivate the account instead/);
    assert.equal(userDeleteCalled, false);
  });
});

test('Platform Admin deletes an eligible user without deleting any related records', async () => {
  const user = makeUser();
  let userDeleteCalled = false;
  let propertyCascadeCalled = false;
  await withReplacements({
    'User.findById': async () => user,
    ...zeroDeleteCounts,
    'Property.deleteMany': async () => { propertyCascadeCalled = true; },
  }, async () => {
    user.deleteOne = async () => { userDeleteCalled = true; };
    const response = createResponse();
    await deleteUser({
      params: { id: userId },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, response);

    assert.equal(response.statusCode, null);
    assert.equal(userDeleteCalled, true);
    assert.equal(propertyCascadeCalled, false);
  });
});

test('Platform Admin cannot delete their own account or another Platform Admin', async () => {
  const targetPlatformAdmin = makeUser({
    role: 'admin',
    adminType: 'platform',
    _id: userId,
  });
  let findByIdCalled = false;
  await withReplacements({
    'User.findById': async () => {
      findByIdCalled = true;
      return targetPlatformAdmin;
    },
  }, async () => {
    const selfResponse = createResponse();
    await deleteUser({
      params: { id: adminId },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, selfResponse);
    assert.equal(selfResponse.statusCode, 403);
    assert.equal(findByIdCalled, false);

    const otherAdminResponse = createResponse();
    await deleteUser({
      params: { id: userId },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, otherAdminResponse);
    assert.equal(otherAdminResponse.statusCode, 403);
    assert.match(otherAdminResponse.body.message, /Platform Admin accounts cannot be deleted/);
  });
});

test('Area Admin can deactivate a tenant associated with a rental in their area and the action is logged', async () => {
  const user = makeUser();
  const logs = [];
  await withReplacements({
    'User.findById': async () => user,
    'Property.find': () => ({
      select: () => ({ lean: async () => [{ _id: 'area-property' }] }),
    }),
    'Property.findOne': () => ({
      select: () => ({ lean: async () => null }),
    }),
    'RentalRequest.findOne': () => ({
      select: () => ({ lean: async () => ({ _id: 'area-rental' }) }),
    }),
    'SystemLog.create': async (record) => { logs.push(record); return record; },
  }, async () => {
    const request = {
      params: { id: userId },
      ip: '127.0.0.1',
      user: {
        id: adminId,
        role: 'admin',
        adminType: 'area',
        assignedArea: 'North',
      },
    };
    const response = createResponse();
    await setUserActive({ ...request, body: { isActive: false } }, response);

    assert.equal(response.statusCode, null);
    assert.equal(user.isActive, false);
    assert.equal(response.body.user.isActive, false);
    assert.equal(logs[0].action, 'USER_DEACTIVATED');
    assert.equal(logs[0].user, adminId);

    const activateResponse = createResponse();
    await setUserActive({ ...request, body: { isActive: true } }, activateResponse);
    assert.equal(user.isActive, true);
    assert.equal(logs[1].action, 'USER_ACTIVATED');
  });
});

test('Area Admin cannot deactivate a user with no property or rental in their area', async () => {
  const user = makeUser();
  await withReplacements({
    'User.findById': async () => user,
    'Property.find': () => ({
      select: () => ({ lean: async () => [{ _id: 'north-property' }] }),
    }),
    'Property.findOne': () => ({
      select: () => ({ lean: async () => null }),
    }),
    'RentalRequest.findOne': () => ({
      select: () => ({ lean: async () => null }),
    }),
  }, async () => {
    const response = createResponse();
    await setUserActive({
      params: { id: userId },
      body: { isActive: false },
      user: {
        id: adminId,
        role: 'admin',
        adminType: 'area',
        assignedArea: 'North',
      },
    }, response);

    assert.equal(response.statusCode, 403);
    assert.equal(user.isActive, true);
  });
});

test('Platform Admin can deactivate and reactivate a non-Platform Admin user with audit logs', async () => {
  const user = makeUser();
  const logs = [];
  await withReplacements({
    'User.findById': async () => user,
    'SystemLog.create': async (record) => { logs.push(record); return record; },
  }, async () => {
    const request = {
      params: { id: userId },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    };
    const deactivateResponse = createResponse();
    await setUserActive({ ...request, body: { isActive: false } }, deactivateResponse);
    assert.equal(deactivateResponse.statusCode, null);
    assert.equal(user.isActive, false);
    assert.equal(user.status, 'suspended');

    const activateResponse = createResponse();
    await setUserActive({ ...request, body: { isActive: true } }, activateResponse);
    assert.equal(activateResponse.statusCode, null);
    assert.equal(user.isActive, true);
    assert.equal(user.status, 'active');
    assert.deepEqual(logs.map((entry) => entry.action), ['USER_DEACTIVATED', 'USER_ACTIVATED']);
  });
});

test('Platform Admin activation approves pending registrations already marked active', async () => {
  const user = makeUser({ status: 'pending', isActive: true });
  const response = createResponse();
  await withReplacements({
    'User.findById': async () => user,
    'SystemLog.create': async () => null,
  }, async () => {
    await setUserActive({
      params: { id: userId },
      body: { isActive: true },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, response);
  });

  assert.equal(response.statusCode, null);
  assert.equal(user.status, 'active');
});

test('user status and role endpoints reject self-actions and Platform Admin targets', async () => {
  const targetPlatformAdmin = makeUser({
    role: 'admin',
    adminType: 'platform',
  });
  let saved = false;
  targetPlatformAdmin.save = async () => { saved = true; };
  await withReplacements({
    'User.findById': async () => targetPlatformAdmin,
  }, async () => {
    const selfStatusResponse = createResponse();
    await setUserActive({
      params: { id: adminId },
      body: { isActive: false },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, selfStatusResponse);
    assert.equal(selfStatusResponse.statusCode, 403);

    const otherStatusResponse = createResponse();
    await setUserActive({
      params: { id: userId },
      body: { isActive: false },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, otherStatusResponse);
    assert.equal(otherStatusResponse.statusCode, 403);

    const selfRoleResponse = createResponse();
    await changeUserRole({
      params: { id: adminId },
      body: { role: 'tenant' },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, selfRoleResponse);
    assert.equal(selfRoleResponse.statusCode, 403);

    const otherRoleResponse = createResponse();
    await changeUserRole({
      params: { id: userId },
      body: { role: 'tenant' },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, otherRoleResponse);
    assert.equal(otherRoleResponse.statusCode, 403);
    assert.equal(saved, false);
  });
});

test('generic user status endpoint rejects Area Admin targets', async () => {
  const targetAreaAdmin = makeUser({
    role: 'admin',
    adminType: 'area',
  });
  let saved = false;
  targetAreaAdmin.save = async () => { saved = true; };

  await withReplacements({
    'User.findById': async () => targetAreaAdmin,
  }, async () => {
    const response = createResponse();
    await setUserActive({
      params: { id: userId },
      body: { isActive: false },
      user: { id: adminId, role: 'admin', adminType: 'platform' },
    }, response);

    assert.equal(response.statusCode, 403);
    assert.match(response.body.message, /Area Admin accounts must be managed through Admin Management/);
    assert.equal(targetAreaAdmin.isActive, true);
    assert.equal(saved, false);
  });
});
