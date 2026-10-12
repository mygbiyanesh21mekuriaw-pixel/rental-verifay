const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'system-settings-integration-test-secret';

const app = require('../app');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');

const userId = '507f1f77bcf86cd799439011';
let maintenanceEnabled = false;
let submissionsEnabled = true;
const defaults = {
  key: 'global',
  defaultAppearance: 'system',
  notifications: { inAppEnabled: true, emailEnabled: true },
  general: {
    websiteName: 'House Rental Management System',
    websiteLogoDataUri: '',
    contactEmail: '',
    contactPhone: '',
    contactAddress: '',
  },
  properties: { submissionsEnabled: true, requireAdminReview: true },
  maintenance: {
    enabled: false,
    message: 'RentalVerify is temporarily unavailable for scheduled maintenance. Please check back soon.',
  },
};

test.beforeEach(() => {
  maintenanceEnabled = false;
  submissionsEnabled = true;
  SystemSettings.findOne = () => {
    let projection = '';
    return {
      select(fields) {
        projection = fields;
        return this;
      },
      lean: async () => projection.includes('maintenance')
        ? {
          maintenance: {
            enabled: maintenanceEnabled,
            message: 'RentalVerify is in maintenance.',
          },
        }
        : projection.includes('submissionsEnabled')
          ? { properties: { submissionsEnabled } }
        : null,
    };
  };
});

const authenticatedRequest = async ({
  method = 'GET',
  role = 'admin',
  adminType = 'platform',
  body,
  token = true,
  path = '/api/admin/system-settings',
} = {}) => {
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
    return await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
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
  SystemSettings.findOne = () => ({
    select() { return this; },
    lean: async () => storedSettings,
  });
  SystemSettings.create = async (record) => {
    createCalls += 1;
    storedSettings = { ...defaults, ...record };
    return storedSettings;
  };

  try {
    const response = await authenticatedRequest();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).settings, {
      defaultAppearance: 'system',
      notifications: { inAppEnabled: true, emailEnabled: true },
      general: {
        websiteName: 'House Rental Management System',
        websiteLogoDataUri: '',
        contactEmail: '',
        contactPhone: '',
        contactAddress: '',
      },
      properties: { submissionsEnabled: true, requireAdminReview: true },
      maintenance: {
        enabled: false,
        message: 'RentalVerify is temporarily unavailable for scheduled maintenance. Please check back soon.',
      },
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
    defaultAppearance: 'dark',
    notifications: { inAppEnabled: false, emailEnabled: true },
    general: {
      websiteName: 'RentalVerify',
      contactEmail: 'hello@example.com',
      contactPhone: '+251 911 123456',
      contactAddress: 'Addis Ababa',
    },
    properties: { submissionsEnabled: false, requireAdminReview: false },
    maintenance: { enabled: false, message: defaults.maintenance.message },
  };
  SystemSettings.findOne = () => ({
    select() { return this; },
    lean: async () => storedSettings,
  });
  SystemSettings.findOneAndUpdate = async (filter, update) => {
    assert.deepEqual(filter, { key: 'global' });
    storedSettings = structuredClone(storedSettings || defaults);
    for (const [path, value] of Object.entries(update.$set)) {
      const parts = path.split('.');
      let target = storedSettings;
      while (parts.length > 1) {
        const part = parts.shift();
        target[part] ||= {};
        target = target[part];
      }
      target[parts[0]] = value;
    }
    return storedSettings;
  };

  try {
    const putResponse = await authenticatedRequest({ method: 'PUT', body: nextSettings });
    assert.equal(putResponse.status, 200);
    const expectedSettings = {
      ...defaults,
      ...nextSettings,
      general: { ...defaults.general, ...nextSettings.general },
      properties: { ...defaults.properties, ...nextSettings.properties },
      notifications: { ...defaults.notifications, ...nextSettings.notifications },
      maintenance: { ...defaults.maintenance, ...nextSettings.maintenance },
    };
    delete expectedSettings.key;
    assert.deepEqual((await putResponse.json()).settings, expectedSettings);

    const getResponse = await authenticatedRequest();
    assert.equal(getResponse.status, 200);
    assert.deepEqual((await getResponse.json()).settings, expectedSettings);
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

test('maintenance mode blocks normal API use but leaves the status endpoint and Platform Admin access available', async () => {
  maintenanceEnabled = true;

  const statusServer = app.listen(0);
  try {
    await new Promise((resolve) => statusServer.once('listening', resolve));
    const statusResponse = await fetch(`http://127.0.0.1:${statusServer.address().port}/api/system/status`);
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json()).maintenance.enabled, true);
  } finally {
    await new Promise((resolve, reject) => {
      statusServer.close((error) => error ? reject(error) : resolve());
    });
  }

  const platformAdminResponse = await authenticatedRequest({ path: '/api/chapa/test' });
  assert.equal(platformAdminResponse.status, 200);

  const settingsResponse = await authenticatedRequest({
    role: 'tenant',
    path: '/api/admin/system-settings',
  });
  assert.equal(settingsResponse.status, 403);

  const normalUserResponse = await authenticatedRequest({
    role: 'tenant',
    path: '/api/chapa/test',
  });
  assert.equal(normalUserResponse.status, 503);
  assert.equal((await normalUserResponse.json()).maintenanceMode, true);
});

test('disabled property submissions are rejected before property upload processing', async () => {
  submissionsEnabled = false;
  const response = await authenticatedRequest({
    method: 'POST',
    role: 'landlord',
    body: {},
    path: '/api/properties',
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).message, 'New property submissions are currently disabled.');
});
