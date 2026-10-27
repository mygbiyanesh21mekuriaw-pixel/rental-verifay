const test = require('node:test');
const assert = require('node:assert/strict');
const { getDefaultUserPermissions, mergeUserPermissions } = require('./userPermissions');
const { ALWAYS_ON, PERMISSION_CATALOG } = require('../config/permissionCatalog');

test('default user permissions enable all role features and all always-on permissions', () => {
  for (const role of ['area_admin', 'landlord', 'tenant', 'platform_admin']) {
    const permissions = getDefaultUserPermissions(role);
    assert.ok(Object.values(permissions).every((enabled) => enabled === true));
    assert.ok(ALWAYS_ON.every((key) => permissions[key] === true));
  }
});

test('platform admins receive a superset of all catalog permissions', () => {
  const platformPermissions = getDefaultUserPermissions('platform_admin');
  for (const role of ['area_admin', 'landlord', 'tenant']) {
    for (const key of PERMISSION_CATALOG[role]) assert.equal(platformPermissions[key], true);
  }
});

test('Area Admins cannot be assigned Users management permission', () => {
  assert.equal(PERMISSION_CATALOG.area_admin.includes('users'), false);
  assert.equal(getDefaultUserPermissions('area_admin').users, undefined);
});

test('individual permission rows override defaults except for always-on keys', () => {
  const permissions = mergeUserPermissions('tenant', [
    { permissionKey: 'favorites', enabled: false },
    { permissionKey: 'dashboard', enabled: false },
  ]);

  assert.equal(permissions.favorites, false);
  assert.equal(permissions.dashboard, true);
  assert.equal(permissions.accountSettings, true);
  assert.equal(permissions.changePassword, true);
});

test('platform-admin permission overrides are ignored', () => {
  const permissions = mergeUserPermissions('platform_admin', [
    { permissionKey: 'messages', enabled: false },
  ]);
  assert.equal(permissions.messages, true);
});
