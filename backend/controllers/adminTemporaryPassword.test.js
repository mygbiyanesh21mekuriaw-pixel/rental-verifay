const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Area = require('../models/Area');
const { createAdminAccount } = require('./adminController');

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

const setupAdminCreation = () => {
  const originals = {
    find: User.find,
    findOne: User.findOne,
    find: User.find,
    create: User.create,
    areaFindOne: Area.findOne,
    environment: Object.fromEntries(['EMAIL_USER', 'EMAIL_PASS'].map((key) => [key, process.env[key]])),
  };
  let savedAdmin;

  process.env.EMAIL_USER = 'configured@example.com';
  process.env.EMAIL_PASS = 'configured-but-unused';
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  User.findOne = async () => null;
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  Area.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'North' }) }) });
  User.create = async (data) => {
    savedAdmin = data;
    return {
      ...data,
      _id: 'area-admin-id',
      toObject() { return { ...data, _id: this._id }; },
    };
  };
  return {
    getSavedAdmin: () => savedAdmin,
    restore() {
      User.find = originals.find;
      User.findOne = originals.findOne;
      User.find = originals.find;
      User.create = originals.create;
      Area.findOne = originals.areaFindOne;
      for (const [key, value] of Object.entries(originals.environment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
};

const createRequest = (password = 'temporary-password') => ({
  body: {
    fullName: 'Area Admin',
    email: 'area@example.com',
    username: 'area_admin',
    phone: '0912345678',
    password,
    area: 'North',
  },
});

test('creates an Area Admin with a hashed temporary password and does not send email', async () => {
  const setup = setupAdminCreation();
  const response = createResponse();

  try {
    await createAdminAccount(createRequest(), response);
    assert.equal(response.statusCode, 201);
    assert.equal(setup.getSavedAdmin().mustChangePassword, true);
    assert.equal(setup.getSavedAdmin().status, 'active');
    assert.equal(await bcrypt.compare('temporary-password', setup.getSavedAdmin().password), true);
    assert.equal(response.body.message, 'Admin created. Please give the temporary password to the admin directly. They must change it on first login.');
    assert.equal(response.body.user.password, undefined);
    assert.doesNotMatch(JSON.stringify(response.body), /temporary-password/);
  } finally {
    setup.restore();
  }
});

test('creates the Area Admin without configured email variables', async () => {
  const setup = setupAdminCreation();
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
  const response = createResponse();

  try {
    await createAdminAccount(createRequest(), response);
    assert.equal(response.statusCode, 201);
    assert.equal(setup.getSavedAdmin().mustChangePassword, true);
    assert.equal(setup.getSavedAdmin().status, 'active');
    assert.equal(response.body.message, 'Admin created. Please give the temporary password to the admin directly. They must change it on first login.');
    assert.equal(response.body.user.password, undefined);
  } finally {
    setup.restore();
  }
});

test('rejects temporary passwords shorter than eight characters', async () => {
  const setup = setupAdminCreation();
  const response = createResponse();

  try {
    await createAdminAccount(createRequest('short7'), response);
    assert.equal(response.statusCode, 400);
    assert.equal(setup.getSavedAdmin(), undefined);
    assert.match(response.body.message, /at least 8 characters/);
  } finally {
    setup.restore();
  }
});