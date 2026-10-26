const test = require('node:test');
const assert = require('node:assert/strict');
const SystemLog = require('../models/SystemLog');
const { requirePermission, requireAdminPropertyPermission, requirePropertyAccess } = require('./auth');

const response = () => ({
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

test('disabled feature is rejected even when the API is called directly', () => {
  const res = response();
  let nextCalled = false;
  requirePermission('rentalRequests')(
    { user: { role: 'admin', adminType: 'area', permissions: { rentalRequests: false } } },
    res,
    () => { nextCalled = true; },
  );
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: 'Permission denied' });
  assert.equal(nextCalled, false);
});

test('denied permission writes the required permission key to the audit trail', async () => {
  const originalCreate = SystemLog.create;
  let auditRecord;
  SystemLog.create = async (record) => {
    auditRecord = record;
    return record;
  };
  try {
    const res = response();
    requirePermission('rentalRequests')({
      baseUrl: '/api/rentals',
      path: '/mine',
      ip: '192.0.2.10',
      user: {
        id: '507f1f77bcf86cd799439011',
        name: 'Area Admin',
        email: 'area@example.com',
        role: 'admin',
        adminType: 'area',
        permissions: { rentalRequests: false },
      },
    }, res, () => {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(res.statusCode, 403);
    assert.equal(auditRecord.action, 'PERMISSION_DENIED');
    assert.equal(auditRecord.status, 'denied');
    assert.equal(auditRecord.details.requiredPermission, 'rentalRequests');
  } finally {
    SystemLog.create = originalCreate;
  }
});

test('enabled features continue to the existing route handler', () => {
  let nextCalled = false;
  requirePermission('rentalRequests')(
    { user: { role: 'admin', adminType: 'area', permissions: { rentalRequests: true } } },
    response(),
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});

test('platform admins always have access regardless of per-user permission rows', () => {
  let nextCalled = false;
  requirePermission('rentalRequests')(
    { user: { role: 'admin', adminType: 'platform', permissions: { rentalRequests: false } } },
    response(),
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});

test('Area Admin property status API checks the matching feature permission', () => {
  const res = response();
  let nextCalled = false;
  requireAdminPropertyPermission(
    {
      query: { status: 'approved' },
      user: {
        role: 'admin',
        adminType: 'area',
        permissions: { allProperties: true, verifiedProperties: false },
      },
    },
    res,
    () => { nextCalled = true; },
  );
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: 'Permission denied' });
  assert.equal(nextCalled, false);
});

test('optional-auth public route remains accessible without a user', () => {
  let nextCalled = false;
  requirePermission('reviews')({}, response(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('tenant cannot label a filtered search as a verified-property browse request', () => {
  const res = response();
  let nextCalled = false;
  requirePropertyAccess({
    query: { title: 'private search', feature: 'verifiedProperties' },
    user: { role: 'tenant', permissions: { verifiedProperties: true, searchProperties: false } },
  }, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: 'Permission denied' });
  assert.equal(nextCalled, false);
});

test('locked dashboard aggregate property request remains available with all property features disabled', () => {
  let nextCalled = false;
  requireAdminPropertyPermission({
    query: { status: 'all' },
    user: {
      role: 'admin',
      adminType: 'area',
      permissions: { allProperties: false, pendingProperties: false, verifiedProperties: false, rejectedProperties: false },
    },
  }, response(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});