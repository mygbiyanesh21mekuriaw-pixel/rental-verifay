const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const { auth, platformAdminOnly } = require('../middleware/auth');
const settingsRouter = require('../routes/systemSettingsRoutes');
const {
  getSystemSettings,
  updateSystemSettings,
} = require('../controllers/systemSettingsController');

const callController = async (controller, req = {}) => {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await controller(req, res);
  return result;
};

const runMiddleware = async (role, adminType, databaseUser) => {
  const req = { user: { id: 'user-id', role, adminType } };
  const result = { statusCode: 200, body: null, nextCalled: false };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  const originalFindById = User.findById;
  User.findById = () => ({ select: async () => databaseUser });
  try {
    await platformAdminOnly(req, res, () => {
      result.nextCalled = true;
    });
  } finally {
    User.findById = originalFindById;
  }
  return result;
};

test('system settings authorization allows platform admins and denies other roles', async () => {
  const cases = [
    ['tenant', undefined, null, 403, false],
    ['landlord', undefined, null, 403, false],
    ['admin', 'area', { role: 'admin', adminType: 'area', adminAreas: ['area-1'] }, 403, false],
    ['admin', 'platform', { role: 'admin', adminType: 'platform', adminAreas: [] }, 200, true],
  ];

  for (const [role, adminType, databaseUser, statusCode, nextCalled] of cases) {
    const result = await runMiddleware(role, adminType, databaseUser);
    assert.equal(result.statusCode, statusCode, `${role}/${adminType || 'none'} status`);
    assert.equal(result.nextCalled, nextCalled, `${role}/${adminType || 'none'} continuation`);
  }
});

test('GET and PUT settings routes require authentication and Platform Admin authorization', () => {
  for (const method of ['get', 'put']) {
    const routeLayer = settingsRouter.stack.find((layer) =>
      layer.route?.path === '/' && layer.route.methods[method]
    );
    assert.ok(routeLayer, `${method.toUpperCase()} settings route is registered`);
    const handlers = routeLayer.route.stack.map((layer) => layer.handle);
    assert.equal(handlers[0], auth);
    assert.equal(handlers[1], platformAdminOnly);
  }
});

test('system settings reject invalid preference values without saving', async () => {
  const originalFindOneAndUpdate = SystemSettings.findOneAndUpdate;
  let saveCalled = false;
  SystemSettings.findOneAndUpdate = () => {
    saveCalled = true;
  };
  const req = {
    body: {
      defaultLanguage: 'xx',
      defaultAppearance: 'light',
      notifications: { inAppEnabled: true, emailEnabled: true },
    },
  };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };

  try {
    await updateSystemSettings(req, res);
  } finally {
    SystemSettings.findOneAndUpdate = originalFindOneAndUpdate;
  }

  assert.equal(result.statusCode, 400);
  assert.equal(saveCalled, false);
});

test('GET system settings returns sensible defaults when no document exists', async () => {
  const originalFindOne = SystemSettings.findOne;
  const originalCreate = SystemSettings.create;
  SystemSettings.findOne = () => ({ lean: async () => null });
  SystemSettings.create = async () => ({
    defaultLanguage: 'en',
    defaultAppearance: 'system',
    notifications: { inAppEnabled: true, emailEnabled: true },
  });

  let result;
  try {
    result = await callController(getSystemSettings);
  } finally {
    SystemSettings.findOne = originalFindOne;
    SystemSettings.create = originalCreate;
  }

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.settings, {
    defaultLanguage: 'en',
    defaultAppearance: 'system',
    notifications: { inAppEnabled: true, emailEnabled: true },
  });
});

test('GET system settings loads saved values from the database', async () => {
  const originalFindOne = SystemSettings.findOne;
  const savedSettings = {
    defaultLanguage: 'sid',
    defaultAppearance: 'dark',
    notifications: { inAppEnabled: false, emailEnabled: false },
  };
  let query;
  SystemSettings.findOne = (filter) => {
    query = filter;
    return { lean: async () => savedSettings };
  };

  let result;
  try {
    result = await callController(getSystemSettings);
  } finally {
    SystemSettings.findOne = originalFindOne;
  }

  assert.deepEqual(query, { key: 'global' });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.settings, savedSettings);
});

test('system settings save only supported global preferences', async () => {
  const originalFindOneAndUpdate = SystemSettings.findOneAndUpdate;
  const savedSettings = {
    defaultLanguage: 'am',
    defaultAppearance: 'dark',
    notifications: { inAppEnabled: false, emailEnabled: true },
  };
  let query;
  let update;
  SystemSettings.findOneAndUpdate = (filter, changes) => {
    query = filter;
    update = changes;
    return Promise.resolve(savedSettings);
  };
  const req = {
    user: { id: 'platform-user' },
    body: {
      ...savedSettings,
      ignoredField: 'not persisted',
    },
  };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };

  try {
    await updateSystemSettings(req, res);
  } finally {
    SystemSettings.findOneAndUpdate = originalFindOneAndUpdate;
  }

  assert.deepEqual(query, { key: 'global' });
  assert.deepEqual(update.$set, {
    defaultLanguage: 'am',
    defaultAppearance: 'dark',
    notifications: { inAppEnabled: false, emailEnabled: true },
    updatedBy: 'platform-user',
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.settings, savedSettings);
});
