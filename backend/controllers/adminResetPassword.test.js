const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { resetAreaAdminPassword } = require('./adminController');

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

test('Platform Admin reset stores a hash and requires the Area Admin to change it', async () => {
  const originalFindById = User.findById;
  const admin = {
    _id: '507f1f77bcf86cd799439015',
    role: 'admin',
    adminType: 'area',
    password: await bcrypt.hash('old-password', 4),
    mustChangePassword: false,
    async save() {},
  };
  User.findById = async () => admin;
  const response = createResponse();

  try {
    await resetAreaAdminPassword({
      params: { id: admin._id },
      body: { temporaryPassword: 'replacement-password' },
    }, response);

    assert.equal(response.statusCode, null);
    assert.equal(admin.mustChangePassword, true);
    assert.equal(await bcrypt.compare('replacement-password', admin.password), true);
    assert.equal(response.body.message, 'Area Admin temporary password reset successfully.');
    assert.equal(JSON.stringify(response.body).includes('replacement-password'), false);
  } finally {
    User.findById = originalFindById;
  }
});

test('rejects short temporary passwords before looking up an admin', async () => {
  const originalFindById = User.findById;
  let lookupCalled = false;
  User.findById = async () => { lookupCalled = true; return null; };
  const response = createResponse();

  try {
    await resetAreaAdminPassword({
      params: { id: '507f1f77bcf86cd799439016' },
      body: { temporaryPassword: 'short' },
    }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(lookupCalled, false);
  } finally {
    User.findById = originalFindById;
  }
});