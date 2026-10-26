const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateAccountStatusAndUserPermissions } = require('./migrateAccountStatusAndUserPermissions');
const { getPermissionKeys } = require('../config/permissionCatalog');

const fixtureUsers = [
  { _id: 'tenant-1', role: 'tenant' },
  { _id: 'legacy-user-1', role: 'tenant', status: null },
  { _id: 'landlord-1', role: 'landlord', status: 'suspended' },
  { _id: 'area-1', role: 'admin', adminType: 'area' },
  { _id: 'platform-1', role: 'admin', adminType: 'platform' },
];

const makeUserModel = (users) => ({
  find: () => ({ select: () => ({ lean: async () => users }) }),
  updateOne: async (...args) => { updates.push(args); },
});

let updates;

test('migration sets only missing account statuses active and adds all role permissions', async () => {
  updates = [];
  const bulkWrites = [];
  const UserModel = makeUserModel(fixtureUsers);
  const UserPermissionModel = {
    bulkWrite: async (...args) => { bulkWrites.push(args); },
    collection: { createIndex: async () => 'unique_user_permission' },
  };

  const result = await migrateAccountStatusAndUserPermissions({ UserModel, UserPermissionModel, execute: true });

  assert.deepEqual(result, { users: 5, statusesActivated: 4, permissionRowsAdded: 76 });
  assert.equal(updates.length, 4);
  assert.ok(updates.every(([, update]) => update.$set.status === 'active' && update.$set.isActive === true));
  assert.equal(bulkWrites.length, 5);
  assert.equal(bulkWrites[0][0].length, getPermissionKeys('tenant').length);
  assert.equal(bulkWrites[1][0].length, getPermissionKeys('tenant').length);
  assert.equal(bulkWrites[2][0].length, getPermissionKeys('landlord').length);
  assert.equal(bulkWrites[3][0].length, getPermissionKeys('area_admin').length);
  assert.equal(bulkWrites[4][0].length, getPermissionKeys('platform_admin').length);
  assert.ok(bulkWrites.every(([operations]) => operations.every((operation) => operation.updateOne.upsert)));
});

test('migration dry run performs no writes', async () => {
  updates = [];
  let bulkWriteCount = 0;
  const UserModel = makeUserModel(fixtureUsers);
  const UserPermissionModel = {
    bulkWrite: async () => { bulkWriteCount += 1; },
    collection: { createIndex: async () => 'unique_user_permission' },
  };

  const result = await migrateAccountStatusAndUserPermissions({ UserModel, UserPermissionModel, execute: false });

  assert.equal(result.users, fixtureUsers.length);
  assert.equal(updates.length, 0);
  assert.equal(bulkWriteCount, 0);
});