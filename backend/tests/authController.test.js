const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const { login, serializeUser } = require('../controllers/authController');
const { encryptBankAccountNumber } = require('../utils/bankAccountCrypto');

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
  const originalFindOne = User.findOne;
  const originalConsoleError = console.error;
  const loggedMessages = [];
  User.findOne = () => ({
    select: async () => {
      const error = new Error('bad auth : authentication failed');
      error.name = 'MongoServerError';
      error.code = 8000;
      throw error;
    },
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
    User.findOne = originalFindOne;
    console.error = originalConsoleError;
  }
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
