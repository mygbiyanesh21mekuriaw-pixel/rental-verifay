const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Area = require('../models/Area');
const SystemLog = require('../models/SystemLog');
const SystemSettings = require('../models/SystemSettings');
const {
  login,
  serializeUser,
  getMe,
  updateProfile,
  changePassword,
  changePasswordOnFirstLogin,
} = require('../controllers/authController');
const { encryptBankAccountNumber } = require('../utils/bankAccountCrypto');
const { planMissingUsernames } = require('../migrate-missing-usernames');

test('username field is optional, normalized, and protected by a sparse unique index', () => {
  const usernamePath = User.schema.path('username');
  const usernameIndex = User.schema.indexes().find(([fields]) => fields.username === 1);
  const user = new User({ username: ' Tenant_1 ' });

  assert.notEqual(usernamePath.options.required, true);
  assert.equal(usernamePath.options.trim, true);
  assert.equal(usernamePath.options.lowercase, true);
  assert.equal(usernamePath.options.minlength, 3);
  assert.equal(usernamePath.options.maxlength, 20);
  assert.deepEqual(usernamePath.options.match, /^[a-z0-9_]+$/);
  assert.deepEqual(usernameIndex[0], { username: 1 });
  assert.equal(usernameIndex[1].unique, true);
  assert.equal(usernameIndex[1].sparse, true);
  assert.equal(user.username, 'tenant_1');
});

test('mustChangePassword defaults to false for existing and newly constructed users', () => {
  const user = new User({ name: 'Existing User', email: 'existing@example.com', password: 'hash' });
  assert.equal(User.schema.path('mustChangePassword').options.default, false);
  assert.equal(user.mustChangePassword, false);
});

test('status defaults active for existing user records and accepts only supported states', () => {
  const user = new User({ name: 'Existing User', email: 'status@example.com', password: 'hash' });
  const statusPath = User.schema.path('status');
  assert.equal(statusPath.options.default, 'active');
  assert.deepEqual(statusPath.options.enum, ['pending', 'active', 'suspended', 'rejected']);
  assert.equal(user.status, 'active');
});

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

test('login reports MongoDB authentication failure without exposing database details', async () => {
  const originalFind = User.find;
  const originalConsoleError = console.error;
  const loggedMessages = [];
  User.find = () => ({
    limit: () => ({
      select: async () => {
        const error = new Error('bad auth : authentication failed');
        error.name = 'MongoServerError';
        error.code = 8000;
        throw error;
      },
    }),
  });
  console.error = (...args) => loggedMessages.push(args.join(' '));
  const response = createResponse();

  try {
    await login(
      { body: { email: 'admin@gmail.com', password: 'not-used' } },
      response
    );

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, {
      message: 'Login is temporarily unavailable because the database connection failed. Please try again later.',
    });
    assert.match(loggedMessages[0], /Verify the backend MONGO_URI database credentials/);
    assert.doesNotMatch(JSON.stringify(response.body), /bad auth|MongoServerError|8000/);
  } finally {
    User.find = originalFind;
    console.error = originalConsoleError;
  }
});

test('login accepts registered emails for tenant, landlord, and admin roles', async () => {
  const originals = {
    find: User.find,
    createSystemLog: SystemLog.create,
    jwtSecret: process.env.JWT_SECRET,
  };
  const hashedPassword = await bcrypt.hash('correct-password', 4);
  const queries = [];
  SystemLog.create = async () => null;
  process.env.JWT_SECRET = 'test-jwt-secret';

  try {
    for (const [identifier, role, adminType] of [
      [' TEST@example.com ', 'tenant', undefined],
      [' TEST@example.com ', 'landlord', undefined],
      [' TEST@example.com ', 'admin', 'area'],
      [' TEST@example.com ', 'admin', 'platform'],
    ]) {
      User.find = (query) => ({
        limit: (count) => ({
          select: async () => {
            assert.equal(count, 2);
            queries.push(query);
            return [{
              _id: { toString: () => 'test-user-id' },
              name: 'Test User',
              email: 'test@example.com',
              password: hashedPassword,
              role,
              adminType,
              adminAreas: adminType === 'area' ? [{ city: 'Test City' }] : [],
            }];
          },
        }),
      });
      const response = createResponse();
      await login({ body: { email: identifier, password: 'correct-password' } }, response);

      assert.equal(response.statusCode, null);
      assert.equal(response.body.user.email, 'test@example.com');
      assert.equal(response.body.user.role, role);
      if (role === 'admin') assert.equal(response.body.user.adminType, adminType);
      assert.ok(response.body.token);
      const escapedEmail = 'test@example.com'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.deepEqual(queries.at(-1), {
        email: { $regex: `^${escapedEmail}$`, $options: 'i' },
      });
    }
  } finally {
    User.find = originals.find;
    SystemLog.create = originals.createSystemLog;
    if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originals.jwtSecret;
  }
});

test('inactive users with valid credentials receive a clear login rejection', async () => {
  const originals = {
    find: User.find,
    createSystemLog: SystemLog.create,
  };
  const hashedPassword = await bcrypt.hash('correct-password', 4);
  let loginLogged = false;
  User.find = () => ({
    limit: () => ({
      select: async () => [{
        _id: 'inactive-user-id',
        name: 'Inactive User',
        email: 'inactive@example.com',
        password: hashedPassword,
        role: 'tenant',
        isActive: false,
      }],
    }),
  });
  SystemLog.create = async () => { loginLogged = true; };
  const response = createResponse();

  try {
    await login({ body: { email: 'inactive@example.com', password: 'correct-password' } }, response);
    assert.equal(response.statusCode, 403);
    assert.match(response.body.message, /account is inactive/i);
    assert.equal(loginLogged, true);
  } finally {
    User.find = originals.find;
    SystemLog.create = originals.createSystemLog;
  }
});

test('login rejects pending, rejected, and suspended users with the account status message', async () => {
  const originalFind = User.find;
  const hashedPassword = await bcrypt.hash('correct-password', 4);

  try {
    for (const [status, message] of [
      ['pending', 'Your account is waiting for Platform Admin approval.'],
      ['rejected', 'Your account application was rejected.'],
      ['suspended', 'Your account is suspended.'],
    ]) {
      User.find = () => ({
        limit: () => ({
          select: async () => [{
            _id: `${status}-user-id`,
            name: 'Status User',
            email: `${status}@example.com`,
            password: hashedPassword,
            role: 'tenant',
            status,
          }],
        }),
      });
      const response = createResponse();
      await login({ body: { email: `${status}@example.com`, password: 'correct-password' } }, response);
      assert.equal(response.statusCode, 403);
      assert.deepEqual(response.body, { message });
    }
  } finally {
    User.find = originalFind;
  }
});

test('approved Area Admins must change their temporary password', async () => {
  const originals = {
    find: User.find,
    createSystemLog: SystemLog.create,
    jwtSecret: process.env.JWT_SECRET,
  };
  const hashedPassword = await bcrypt.hash('temporary-password', 4);
  User.find = () => ({
    limit: () => ({
      select: async () => [{
        _id: { toString: () => 'pending-area-admin' },
        name: 'Area Admin',
        email: 'area@example.com',
        password: hashedPassword,
        role: 'admin',
        adminType: 'area',
        status: 'active',
        mustChangePassword: true,
      }],
    }),
  });
  SystemLog.create = async () => null;
  process.env.JWT_SECRET = 'test-jwt-secret';
  const response = createResponse();

  try {
    await login({ body: { identifier: 'area_admin', password: 'temporary-password' } }, response);
    assert.equal(response.body.mustChangePassword, true);
    assert.equal(response.body.user.mustChangePassword, true);
  } finally {
    User.find = originals.find;
    SystemLog.create = originals.createSystemLog;
    if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originals.jwtSecret;
  }
});

test('login accepts usernames and identifier emails while retaining email request compatibility', async () => {
  const originals = {
    find: User.find,
    createSystemLog: SystemLog.create,
    jwtSecret: process.env.JWT_SECRET,
  };
  const hashedPassword = await bcrypt.hash('correct-password', 4);
  const queries = [];
  SystemLog.create = async () => null;
  process.env.JWT_SECRET = 'test-jwt-secret';
  User.find = (query) => ({
    limit: () => ({
      select: async () => {
        queries.push(query);
        const isMatchingEmail = query.email?.$regex === '^test@example\\.com$';
        const isMatchingUsername = query.username?.$regex === '^tenant_1$';
        return isMatchingEmail || isMatchingUsername
          ? [{
            _id: { toString: () => 'test-user-id' },
            name: 'Test User',
            email: 'test@example.com',
            username: 'tenant_1',
            password: hashedPassword,
            role: 'tenant',
          }]
          : [];
      },
    }),
  });

  try {
    for (const body of [
      { identifier: ' TENANT_1 ', password: 'correct-password' },
      { identifier: ' TEST@EXAMPLE.COM ', password: 'correct-password' },
      { email: ' TEST@EXAMPLE.COM ', password: 'correct-password' },
    ]) {
      const response = createResponse();
      await login({ body }, response);
      assert.equal(response.statusCode, null);
      assert.equal(response.body.user.email, 'test@example.com');
      assert.ok(response.body.token);
    }

    assert.deepEqual(queries, [
      { username: { $regex: '^tenant_1$', $options: 'i' } },
      { email: { $regex: '^test@example\\.com$', $options: 'i' } },
      { email: { $regex: '^test@example\\.com$', $options: 'i' } },
    ]);
  } finally {
    User.find = originals.find;
    SystemLog.create = originals.createSystemLog;
    if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originals.jwtSecret;
  }
});

test('login rejects incorrect passwords, unknown emails, malformed emails, and missing credentials', async () => {
  const originalFind = User.find;
  const user = {
    password: await bcrypt.hash('correct-password', 4),
  };
  let lookupCount = 0;

  User.find = (query) => ({
    limit: () => ({
      select: async () => {
        lookupCount += 1;
        return query.email?.$regex === '^known@example\\.com$' ||
          query.username?.$regex === '^known_user$'
          ? [user]
          : [];
      },
    }),
  });

  try {
    const cases = [
      {
        body: { email: 'known@example.com', password: 'wrong-password' },
        message: 'Invalid credentials',
      },
      {
        body: { email: 'missing@example.com', password: 'correct-password' },
        message: 'Invalid credentials',
      },
      {
        body: { identifier: 'known_user', password: 'wrong-password' },
        message: 'Invalid credentials',
      },
      {
        body: { identifier: 'missing_user', password: 'correct-password' },
        message: 'Invalid credentials',
      },
      {
        body: { email: 'not-an-email', password: 'correct-password' },
        message: 'Invalid credentials',
      },
      {
        body: { email: '', password: 'correct-password' },
        message: 'Invalid credentials',
      },
      {
        body: { email: 'known@example.com', password: '' },
        message: 'Invalid credentials',
      },
      {
        body: { password: 'correct-password' },
        message: 'Invalid credentials',
      },
    ];
    for (const req of cases) {
      const response = createResponse();
      await login(req, response);
      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.body, {
        message: req.message,
      });
    }
    assert.equal(lookupCount, 4);
  } finally {
    User.find = originalFind;
  }
});

test('registration rejects usernames outside the 3-20 letter, number, underscore format', async () => {
  const originalFindOne = User.findOne;
  const { register } = require('../controllers/authController');
  const invalidUsernames = ['ab', 'username-that-is-too-long', 'has space', 'has@sign', 'name-with-hyphen'];

  try {
    for (const username of invalidUsernames) {
      let lookupCount = 0;
      User.findOne = async () => {
        lookupCount += 1;
        return null;
      };
      const response = createResponse();
      await register({
        body: {
          name: 'Tenant Example',
          email: 'tenant@example.com',
          username,
          phone: '0912345678',
          area: 'North',
          password: 'secure-password',
          role: 'tenant',
        },
      }, response);

      assert.equal(response.statusCode, 400, username);
      assert.deepEqual(response.body, {
        message: 'Username must be 3-20 characters and use only letters, numbers, or underscores.',
      });
      assert.equal(lookupCount, 0);
    }
  } finally {
    User.findOne = originalFindOne;
  }
});

test('login rejects ambiguous case-insensitive email matches', async () => {
  const originalFind = User.find;
  User.find = () => ({
    limit: () => ({
      select: async () => [
        { password: 'not-a-real-password-hash' },
        { password: 'not-a-real-password-hash' },
      ],
    }),
  });
  const response = createResponse();

  try {
    await login({ body: { email: 'duplicate@example.com', password: 'some-password' } }, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: 'Invalid credentials' });
  } finally {
    User.find = originalFind;
  }
});

test('registration rejects usernames already in use without changing password handling', async () => {
  const originalFindOne = User.findOne;
  const originalAreaFindOne = Area.findOne;
  const { register } = require('../controllers/authController');
  const response = createResponse();
  const queries = [];
  User.findOne = async (query) => {
    queries.push(query);
    return query.username ? { _id: 'existing-user' } : null;
  };
  Area.findOne = () => ({
    select: () => ({ lean: async () => ({ name: 'North' }) }),
  });

  try {
    await register({
      body: {
        name: 'Tenant Example',
        email: 'tenant@example.com',
        username: 'Taken_Name',
        phone: '0912345678',
        area: 'North',
        password: 'secure-password',
        role: 'tenant',
      },
    }, response);

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, { message: 'That username is already in use.' });
    assert.deepEqual(queries, [
      { email: 'tenant@example.com' },
      { username: { $regex: '^taken_name$', $options: 'i' } },
    ]);
  } finally {
    User.findOne = originalFindOne;
    Area.findOne = originalAreaFindOne;
  }
});

test('registration requires a username before querying or creating an account', async () => {
  const originalFindOne = User.findOne;
  const { register } = require('../controllers/authController');
  let lookupCount = 0;
  User.findOne = async () => {
    lookupCount += 1;
    return null;
  };
  const response = createResponse();

  try {
    await register({
      body: {
        name: 'Tenant Example',
        email: 'tenant@example.com',
        username: '   ',
        phone: '0912345678',
        password: 'secure-password',
        role: 'tenant',
      },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      message: 'Name, email, username, phone, password and role are required.',
    });
    assert.equal(lookupCount, 0);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('landlords and tenants can register without an area', async () => {
  const originals = {
    findOne: User.findOne,
    save: User.prototype.save,
    areaFindOne: Area.findOne,
    systemLogCreate: SystemLog.create,
    jwtSecret: process.env.JWT_SECRET,
  };
  const savedUsers = [];
  const { register } = require('../controllers/authController');
  User.findOne = async () => null;
  User.prototype.save = async function save() {
    this._id = { toString: () => `${this.role}-id` };
    savedUsers.push(this);
  };
  Area.findOne = () => assert.fail('Registration without an area must not query areas');
  SystemLog.create = async () => null;
  process.env.JWT_SECRET = 'test-registration-secret';

  try {
    for (const role of ['landlord', 'tenant']) {
      const response = createResponse();
      await register({
        body: {
          name: `${role} example`,
          email: `${role}@example.com`,
          username: `${role}_example`,
          phone: '0912345678',
          password: 'secure-password',
          role,
        },
      }, response);

      assert.equal(response.statusCode, 201);
      assert.equal(response.body.user.role, role);
      assert.equal(response.body.user.area, '');
      assert.equal(response.body.user.status, 'pending');
      assert.equal(response.body.token, undefined);
      assert.match(response.body.message, /waiting for Platform Admin approval/);
    }
    assert.deepEqual(savedUsers.map((user) => user.area), ['', '']);
  } finally {
    User.findOne = originals.findOne;
    User.prototype.save = originals.save;
    Area.findOne = originals.areaFindOne;
    SystemLog.create = originals.systemLogCreate;
    if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originals.jwtSecret;
  }
});

test('missing legacy usernames are planned uniquely without changing credentials', () => {
  const assignments = planMissingUsernames([
    { _id: 'account-1', email: 'Tenant@Example.com', username: 'Tenant' },
    { _id: 'account-2', email: 'tenant@example.net' },
    { _id: 'account-3', email: 'TENANT@example.org', username: '' },
    { _id: 'account-4', email: 'x@example.org', username: null },
  ]);

  assert.deepEqual(assignments, [
    { userId: 'account-2', username: 'tenant2' },
    { userId: 'account-3', username: 'tenant3' },
    { userId: 'account-4', username: 'useraccount4' },
  ]);
});

test('landlord serialization allows dashboard login when saved bank encryption key has changed', () => {
  const previousEncryptionKey = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  const previousJwtSecret = process.env.JWT_SECRET;
  const originalConsoleError = console.error;
  const loggedMessages = [];

  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'old-bank-encryption-key';
  process.env.JWT_SECRET = 'test-jwt-secret';
  const encryptedNumber = encryptBankAccountNumber('001234567890');
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'new-bank-encryption-key';
  console.error = (...args) => loggedMessages.push(args.join(' '));

  try {
    const user = serializeUser({
      _id: { toString: () => 'landlord-id' },
      name: 'Dejen',
      email: 'dejen@gmail.com',
      role: 'landlord',
      bankAccountSource: 'existing_account',
      bankAccountNumber: encryptedNumber,
      bankAccountConfigured: true,
      bankAccountName: 'Dejen',
      bankName: 'Example Bank',
      bankCode: 'EXAMPLE',
    });

    assert.equal(user.id, 'landlord-id');
    assert.equal(user.role, 'landlord');
    assert.equal(user.bankAccountConfigured, false);
    assert.equal(user.bankAccountNeedsUpdate, true);
    assert.equal(user.bankAccountMasked, '');
    assert.match(loggedMessages[0], /must enter it again/);
  } finally {
    console.error = originalConsoleError;
    if (previousEncryptionKey === undefined) delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
    else process.env.BANK_ACCOUNT_ENCRYPTION_KEY = previousEncryptionKey;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});

test('first-login password change rejects temporary-password reuse and clears the flag after saving', async () => {
  const originalFindById = User.findById;
  const user = {
    _id: 'area-admin-id',
    password: await bcrypt.hash('temporary-password', 4),
    mustChangePassword: true,
    async save() {},
  };
  User.findById = async () => user;

  try {
    const samePasswordResponse = createResponse();
    await changePasswordOnFirstLogin({
      user: { id: 'area-admin-id' },
      body: { newPassword: 'temporary-password' },
    }, samePasswordResponse);
    assert.equal(samePasswordResponse.statusCode, 400);
    assert.deepEqual(samePasswordResponse.body, {
      message: 'New password must be different from the temporary password.',
    });

    const response = createResponse();
    await changePasswordOnFirstLogin({
      user: { id: 'area-admin-id' },
      body: { newPassword: 'permanent-password' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(response.body.mustChangePassword, false);
    assert.equal(user.mustChangePassword, false);
    assert.equal(await bcrypt.compare('permanent-password', user.password), true);
  } finally {
    User.findById = originalFindById;
  }
});

test('user serialization includes the first-login password-change flag', () => {
  const user = serializeUser({
    _id: { toString: () => 'area-admin-id' },
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    mustChangePassword: true,
  });

  assert.equal(user.mustChangePassword, true);
});

test('getMe returns only the authenticated user security history without sensitive log fields', async () => {
  const originals = {
    findById: User.findById,
    findLogs: SystemLog.find,
    findSettings: SystemSettings.findOne,
  };
  const ownUser = {
    _id: 'authenticated-user-id',
    name: 'Own User',
    email: 'own@example.com',
    password: 'must-not-return',
    role: 'tenant',
    bankAccountNumber: 'private-bank-number',
    profilePhoto: '',
  };
  const loginLogs = [
    { createdAt: new Date('2025-03-02T10:00:00Z'), userAgent: 'Chrome/123', ip: '192.0.2.1', details: { secret: 'hidden' } },
    { createdAt: new Date('2025-03-01T10:00:00Z'), userAgent: 'Firefox/123', ip: '192.0.2.2' },
  ];
  const passwordLogs = [{ createdAt: new Date('2025-02-20T08:00:00Z'), details: { password: 'hidden' } }];
  const queries = [];
  User.findById = (id) => {
    assert.equal(id, 'authenticated-user-id');
    return { select: async () => ownUser };
  };
  SystemSettings.findOne = () => ({ lean: async () => ({ notifications: { inAppEnabled: true, emailEnabled: false } }) });
  SystemLog.find = (query) => {
    queries.push(query);
    const records = query.action === 'USER_LOGIN' ? loginLogs : passwordLogs;
    return {
      sort() { return this; },
      limit() { return this; },
      select() { return this; },
      lean: async () => records,
    };
  };
  const response = createResponse();

  try {
    await getMe({ user: { id: 'authenticated-user-id', permissions: { dashboard: true } } }, response);
    assert.equal(response.statusCode, null);
    assert.deepEqual(queries.map((query) => query.user), ['authenticated-user-id', 'authenticated-user-id']);
    assert.deepEqual(queries[1].action, { $in: ['PASSWORD_CHANGED', 'PASSWORD_RESET'] });
    assert.equal(response.body.lastLoginAt.toISOString(), '2025-03-02T10:00:00.000Z');
    assert.equal(response.body.lastPasswordChangeAt.toISOString(), '2025-02-20T08:00:00.000Z');
    assert.deepEqual(response.body.recentSignIns, [
      { at: loginLogs[0].createdAt, userAgent: 'Chrome/123' },
      { at: loginLogs[1].createdAt, userAgent: 'Firefox/123' },
    ]);
    assert.doesNotMatch(JSON.stringify(response.body), /must-not-return|private-bank-number|192\.0\.2|hidden/);
  } finally {
    User.findById = originals.findById;
    SystemLog.find = originals.findLogs;
    SystemSettings.findOne = originals.findSettings;
  }
});

test('profile updates are scoped to the authenticated user and cannot change role, area, or active status', async () => {
  const originals = {
    findById: User.findById,
    createLog: SystemLog.create,
  };
  const user = {
    _id: 'own-user-id',
    name: 'Before',
    email: 'own@example.com',
    phone: '',
    role: 'admin',
    adminType: 'area',
    area: 'Own Area',
    isActive: true,
    async save() {},
  };
  let queriedId;
  User.findById = (id) => {
    queriedId = id;
    return { select: async () => user };
  };
  SystemLog.create = async () => null;

  try {
    const response = createResponse();
    await updateProfile({
      user: { id: 'own-user-id' },
      body: { name: 'Updated Name', phone: '0912345678' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(queriedId, 'own-user-id');
    assert.equal(user.name, 'Updated Name');
    assert.equal(user.phone, '0912345678');
    assert.equal(user.role, 'admin');
    assert.equal(user.area, 'Own Area');
    assert.equal(user.isActive, true);

    const immutableResponse = createResponse();
    await updateProfile({
      user: { id: 'own-user-id' },
      body: { role: 'platform_admin', area: 'Other Area', isActive: false },
    }, immutableResponse);
    assert.equal(immutableResponse.statusCode, 400);
    assert.equal(user.area, 'Own Area');
    assert.equal(user.isActive, true);
  } finally {
    User.findById = originals.findById;
    SystemLog.create = originals.createLog;
  }
});

test('profile email changes require the current password and phone uses the requested Ethiopian formats', async () => {
  const originals = {
    findById: User.findById,
    findOne: User.findOne,
    createLog: SystemLog.create,
  };
  const user = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Email User',
    email: 'before@example.com',
    password: await bcrypt.hash('correct-password', 4),
    phone: '',
    role: 'tenant',
    async save() {},
  };
  User.findById = () => ({ select: async () => user });
  User.findOne = () => ({ select: async () => null });
  SystemLog.create = async () => null;

  try {
    const missingPassword = createResponse();
    await updateProfile({ user: { id: 'email-user-id' }, body: { email: 'after@example.com' } }, missingPassword);
    assert.equal(missingPassword.statusCode, 400);
    assert.equal(user.email, 'before@example.com');

    const invalidPhone = createResponse();
    await updateProfile({ user: { id: 'email-user-id' }, body: { phone: '0712345678' } }, invalidPhone);
    assert.equal(invalidPhone.statusCode, 400);
    assert.equal(user.phone, '');

    const emailResponse = createResponse();
    await updateProfile({
      user: { id: 'email-user-id' },
      body: { email: 'after@example.com', currentPassword: 'correct-password' },
    }, emailResponse);
    assert.equal(emailResponse.statusCode, null);
    assert.equal(user.email, 'after@example.com');
  } finally {
    User.findById = originals.findById;
    User.findOne = originals.findOne;
    SystemLog.create = originals.createLog;
  }
});

test('password changes enforce minimum length and reject reusing the current password', async () => {
  const originals = {
    findById: User.findById,
    createLog: SystemLog.create,
  };
  const user = {
    _id: 'password-user-id',
    name: 'Password User',
    email: 'password@example.com',
    password: await bcrypt.hash('current-password', 4),
    async save() {},
  };
  User.findById = async () => user;
  SystemLog.create = async () => null;

  try {
    const shortPassword = createResponse();
    await changePassword({
      user: { id: 'password-user-id' },
      body: { currentPassword: 'current-password', newPassword: 'short' },
    }, shortPassword);
    assert.equal(shortPassword.statusCode, 400);

    const samePassword = createResponse();
    await changePassword({
      user: { id: 'password-user-id' },
      body: { currentPassword: 'current-password', newPassword: 'current-password' },
    }, samePassword);
    assert.equal(samePassword.statusCode, 400);
    assert.match(samePassword.body.message, /different from the current password/i);

    const changedPassword = createResponse();
    await changePassword({
      user: { id: 'password-user-id' },
      body: { currentPassword: 'current-password', newPassword: 'new-secure-password' },
    }, changedPassword);
    assert.equal(changedPassword.statusCode, null);
    assert.equal(await bcrypt.compare('new-secure-password', user.password), true);
  } finally {
    User.findById = originals.findById;
    SystemLog.create = originals.createLog;
  }
});
