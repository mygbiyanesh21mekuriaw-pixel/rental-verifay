const test = require('node:test');
const assert = require('node:assert/strict');
const { platformAdminOnly, auth } = require('../middleware/auth');
const { getMyPermissions } = require('../controllers/permissionController');
const adminRoutes = require('./adminRoutes');
const permissionRoutes = require('./permissionRoutes');

const routeByPath = (router, path, method) => router.stack.find((layer) =>
  layer.route?.path === path && layer.route.methods[method]
)?.route;

test('GET /api/permissions/me requires authentication', () => {
  const route = routeByPath(permissionRoutes, '/me', 'get');
  assert.ok(route);
  assert.equal(route.stack[0].handle, auth);
});

test('user permission, approval, and area-admin routes require Platform Admin', () => {
  for (const [path, method] of [
    ['/users/:id/permissions', 'get'],
    ['/users/:id/permissions', 'put'],
    ['/users/:id/approve', 'post'],
    ['/area-admins', 'post'],
  ]) {
    const route = routeByPath(adminRoutes, path, method);
    assert.ok(route, `expected route ${path}`);
    assert.equal(route.stack.some((layer) => layer.handle === platformAdminOnly), true);
  }
});

test('GET /api/permissions/me defaults to all role permissions when the user has no rows', () => {
  const response = {
    json(body) {
      assert.ok(body.permissions.includes('dashboard'));
      assert.ok(body.permissions.includes('allProperties'));
      assert.ok(body.permissions.includes('changePassword'));
      return body;
    },
  };

  getMyPermissions({ user: { role: 'admin', adminType: 'area', permissions: {} } }, response);
});

test('pending users query rejects Area Admins before the users controller', () => {
  const route = routeByPath(adminRoutes, '/users', 'get');
  const roleGuard = route.stack[1].handle;
  const response = {
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
  };
  let nextCalled = false;

  roleGuard({ query: { status: 'pending' }, user: { role: 'admin', adminType: 'area' } }, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});