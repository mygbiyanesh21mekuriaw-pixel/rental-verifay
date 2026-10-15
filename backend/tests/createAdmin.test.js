const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const createAdmin = require('../create-admin');

const originalConnectionState = mongoose.connection.readyState;
const originalFindOne = User.findOne;
const originalUpdateOne = User.updateOne;
const originalCountDocuments = User.countDocuments;
const originalUserSave = User.prototype.save;
const originalConnect = mongoose.connect;
const originalEnv = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_NAME: process.env.ADMIN_NAME,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  MONGO_URI: process.env.MONGO_URI,
};
const originalConsoleWarn = console.warn;

test.beforeEach(() => {
  mongoose.connection.readyState = 1;
  process.env.ADMIN_EMAIL = 'platform@example.com';
  process.env.ADMIN_NAME = 'Platform Administrator';
  process.env.ADMIN_PASSWORD = 'bootstrap-password';
  User.countDocuments = async () => 1;
});

test.afterEach(() => {
  mongoose.connection.readyState = originalConnectionState;
  User.findOne = originalFindOne;
  User.updateOne = originalUpdateOne;
  User.countDocuments = originalCountDocuments;
  User.prototype.save = originalUserSave;
  mongoose.connect = originalConnect;
  console.warn = originalConsoleWarn;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('existing platform admin with the old username only has its username updated', async () => {
  const existingAdmin = {
    _id: 'platform-admin-id',
    email: 'platform@example.com',
    name: 'Keep Existing Name',
    username: 'platform.admin',
    password: 'keep-existing-password-hash',
    role: 'admin',
    adminType: 'platform',
    phone: 'keep-existing-phone',
  };
  let updated;
  User.findOne = (query) => {
    if (query.email) return Promise.resolve(existingAdmin);
    return {
      select: async () => null,
    };
  };
  User.updateOne = async (...args) => {
    updated = args;
    return { matchedCount: 1 };
  };

  const result = await createAdmin();

  assert.equal(result, existingAdmin);
  assert.equal(existingAdmin.username, 'platform_admin');
  assert.deepEqual(updated, [
    { _id: 'platform-admin-id' },
    { $set: { username: 'platform_admin' } },
    { runValidators: true },
  ]);
  assert.equal(existingAdmin.password, 'keep-existing-password-hash');
  assert.equal(existingAdmin.name, 'Keep Existing Name');
  assert.equal(existingAdmin.phone, 'keep-existing-phone');
});

test('username collision warns and leaves the existing platform admin unchanged', async () => {
  const existingAdmin = {
    _id: 'platform-admin-id',
    email: 'platform@example.com',
    username: '',
    role: 'admin',
    adminType: 'platform',
  };
  const warnings = [];
  let updateCalled = false;
  User.findOne = (query) => {
    if (query.email) return Promise.resolve(existingAdmin);
    return {
      select: async () => ({ _id: 'other-user-id' }),
    };
  };
  User.updateOne = async () => {
    updateCalled = true;
    return { matchedCount: 1 };
  };
  console.warn = (...args) => warnings.push(args.join(' '));

  const result = await createAdmin();

  assert.equal(result, existingAdmin);
  assert.equal(existingAdmin.username, '');
  assert.equal(updateCalled, false);
  assert.match(warnings.join('\n'), /another user already has that username/);
});

test('existing platform admin is found by role instead of creating another admin', async () => {
  delete process.env.ADMIN_EMAIL;
  const existingAdmin = {
    _id: 'platform-admin-id',
    email: 'platform@example.com',
    username: 'platform_admin',
    role: 'admin',
    adminType: 'platform',
  };
  let createLookupCalled = false;
  User.findOne = (query) => {
    if (query.role === 'admin') return Promise.resolve(existingAdmin);
    createLookupCalled = true;
    return Promise.resolve(null);
  };
  User.updateOne = async () => {
    throw new Error('An already-canonical username must not be updated.');
  };

  const result = await createAdmin();

  assert.equal(result, existingAdmin);
  assert.equal(createLookupCalled, false);
});

test('new platform admin is created with the canonical username', async () => {
  process.env.ADMIN_EMAIL = 'new-platform@example.com';
  let savedAdmin;
  User.findOne = (query) => {
    if (query.email) return Promise.resolve(null);
    if (query.role === 'admin') return Promise.resolve(null);
    return {
      select: async () => null,
    };
  };
  User.countDocuments = async () => 0;
  User.prototype.save = async function save() {
    savedAdmin = this;
    return this;
  };

  const result = await createAdmin();

  assert.equal(result, savedAdmin);
  assert.equal(savedAdmin.username, 'platform_admin');
  assert.equal(savedAdmin.email, 'new-platform@example.com');
  assert.equal(savedAdmin.role, 'admin');
  assert.equal(savedAdmin.adminType, 'platform');
});
