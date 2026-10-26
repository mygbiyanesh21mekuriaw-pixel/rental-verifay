const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const { auth, platformAdminOnly } = require('../middleware/auth');
const settingsRouter = require('../routes/systemSettingsRoutes');
const {
  getSystemSettings,
  updateSystemSettings,
  uploadWebsiteLogo,
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
  const logoRoute = settingsRouter.stack.find((layer) =>
    layer.route?.path === '/logo' && layer.route.methods.post
  );
  assert.ok(logoRoute, 'POST logo route is registered');
  const logoHandlers = logoRoute.route.stack.map((layer) => layer.handle);
  assert.equal(logoHandlers[0], auth);
  assert.equal(logoHandlers[1], platformAdminOnly);
});

test('website logo upload rejects SVG and malformed content without saving it', async () => {
  const originalFindOneAndUpdate = SystemSettings.findOneAndUpdate;
  let saveCalled = false;
  SystemSettings.findOneAndUpdate = () => {
    saveCalled = true;
  };
  const result = await callController(uploadWebsiteLogo, {
    user: { id: 'platform-user' },
    file: {
      mimetype: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    },
  });
  SystemSettings.findOneAndUpdate = originalFindOneAndUpdate;

  assert.equal(result.statusCode, 400);
  assert.equal(saveCalled, false);
});

test('system settings reject invalid preference values without saving', async () => {
  const originalFindOneAndUpdate = SystemSettings.findOneAndUpdate;
  let saveCalled = false;
  SystemSettings.findOneAndUpdate = () => {
    saveCalled = true;
  };
  const req = {
    body: {
      defaultAppearance: 'unknown',
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
    auditRetention: { enabled: false, months: 12 },
  });
});

test('GET settings ignores legacy saved language values without changing other stored settings', async () => {
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
  assert.deepEqual(result.body.settings, {
    defaultAppearance: savedSettings.defaultAppearance,
    notifications: savedSettings.notifications,
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
    auditRetention: { enabled: false, months: 12 },
  });
});

test('system settings save only supported global preferences', async () => {
  const originalFindOneAndUpdate = SystemSettings.findOneAndUpdate;
  const originalFindOne = SystemSettings.findOne;
  const SystemLog = require('../models/SystemLog');
  const originalSystemLogCreate = SystemLog.create;
  const savedSettings = {
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
  SystemSettings.findOne = () => ({ lean: async () => null });
  SystemLog.create = async (record) => record;
  const req = {
    user: { id: 'platform-user' },
    body: {
      defaultLanguage: 'am',
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
    SystemSettings.findOne = originalFindOne;
    SystemLog.create = originalSystemLogCreate;
  }

  assert.deepEqual(query, { key: 'global' });
  assert.deepEqual(update.$set, {
    defaultAppearance: 'dark',
    'notifications.inAppEnabled': false,
    'notifications.emailEnabled': true,
    updatedBy: 'platform-user',
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.settings, {
    defaultAppearance: savedSettings.defaultAppearance,
    notifications: savedSettings.notifications,
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
    auditRetention: { enabled: false, months: 12 },
  });
});
