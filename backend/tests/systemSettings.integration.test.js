const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'system-settings-integration-test-secret';

const app = require('../app');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');

const userId = '507f1f77bcf86cd799439011';
const defaults = {
  key: 'global',
  defaultLanguage: 'en',
  defaultAppearance: 'system',
  notifications: { inAppEnabled: true, emailEnabled: true },
};

const authenticatedRequest = async ({ method = 'GET', role = 'admin', adminType = 'platform', body, token = true } = {}) => {
  const databaseUser = { _id: userId, role, adminType, adminAreas: role === 'admin' && adminType === 'area' ? ['area-1'] : [] };
  const originalFindById = User.findById;
  User.findById = () => ({
    select() {
      return this;
    },
    lean() {
      return Promise.resolve(databaseUser);
    },
    then(resolve, reject) {
      return Promise.resolve(databaseUser).then(resolve, reject);
    },
  });

  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`;
    }
    if (body) headers['Content-Type'] = 'application/json';
    return await fetch(`http://127.0.0.1:${server.address().port}/api/admin/system-settings`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    User.findById = originalFindById;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
};

test('the main Express app GET endpoint creates and returns defaults when no record exists', async () => {
  const originalFindOne = SystemSettings.findOne;
  const originalCreate = SystemSettings.create;
  let storedSettings = null;
  let createCalls = 0;
  SystemSettings.findOne = () => ({ lean: async () => storedSettings });
  SystemSettings.create = async (record) => {
    createCalls += 1;
    storedSettings = { ...defaults, ...record };
    return storedSettings;
  };

  try {
    const response = await authenticatedRequest();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).settings, {
      defaultLanguage: 'en',
      defaultAppearance: 'system',
      notifications: { inAppEnabled: true, emailEnabled: true },
    });
    assert.equal(createCalls, 1);
  } finally {
    SystemSettings.findOne = originalFindOne;
    SystemSettings.create = originalCreate;
  }
});

test('the main Express app PUT endpoint persists settings and GET returns saved values', async () => {
  const originalFindOne = SystemSettings.findOne;
  const originalFindOneAndUpdate = SystemSettings.findOneAndUpdate;
  let storedSettings = null;
  const nextSettings = {
    defaultLanguage: 'ti',
    defaultAppearance: 'dark',
    notifications: { inAppEnabled: false, emailEnabled: true },
  };
  SystemSettings.findOne = () => ({ lean: async () => storedSettings });
  SystemSettings.findOneAndUpdate = async (filter, update) => {
    assert.deepEqual(filter, { key: 'global' });
    storedSettings = { key: 'global', ...update.$set };
    return storedSettings;
  };

  try {
    const putResponse = await authenticatedRequest({ method: 'PUT', body: nextSettings });
    assert.equal(putResponse.status, 200);
    assert.deepEqual((await putResponse.json()).settings, nextSettings);

    const getResponse = await authenticatedRequest();
    assert.equal(getResponse.status, 200);
    assert.deepEqual((await getResponse.json()).settings, nextSettings);
  } finally {
    SystemSettings.findOne = originalFindOne;
    SystemSettings.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('the main Express app rejects unauthenticated settings requests', async () => {
  const response = await authenticatedRequest({ token: false });
  assert.equal(response.status, 401);
});

test('the main Express app denies settings access to tenant, landlord, and area admin', async () => {
  for (const [role, adminType] of [
    ['tenant', undefined],
    ['landlord', undefined],
    ['admin', 'area'],
  ]) {
    const getResponse = await authenticatedRequest({ role, adminType });
    assert.equal(getResponse.status, 403, `${role}/${adminType || 'none'} GET status`);
    const putResponse = await authenticatedRequest({
      method: 'PUT',
      role,
      adminType,
      body: defaults,
    });
    assert.equal(putResponse.status, 403, `${role}/${adminType || 'none'} PUT status`);
  }
});
