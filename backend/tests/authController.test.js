const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Area = require('../models/Area');
const SystemLog = require('../models/SystemLog');
const { login, serializeUser, changePasswordOnFirstLogin } = require('../controllers/authController');
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

test('login returns mustChangePassword for pending Area Admins', async () => {
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
