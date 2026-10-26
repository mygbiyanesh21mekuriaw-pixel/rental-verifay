const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('./contactRoutes');

const getRoute = (method, path) => router.stack
  .map((layer) => layer.route)
  .find((route) => route?.path === path && route.methods[method]);

test('Area Admin contact inbox paths and legacy aliases use the same Area Admin-only handlers', () => {
  const routePairs = [
    ['get', '/area-admin/inbox', '/platform-admin/inbox'],
    ['put', '/area-admin/inbox/:id/read', '/platform-admin/inbox/:id/read'],
  ];

  routePairs.forEach(([method, currentPath, legacyPath]) => {
    const currentRoute = getRoute(method, currentPath);
    const legacyRoute = getRoute(method, legacyPath);
    assert.ok(currentRoute);
    assert.ok(legacyRoute);
    assert.deepEqual(
      currentRoute.stack.map((layer) => layer.handle),
      legacyRoute.stack.map((layer) => layer.handle),
    );

    const requireAreaAdmin = currentRoute.stack[1].handle;
    let areaAdminNextCalled = false;
    requireAreaAdmin(
      { user: { role: 'admin', adminType: 'area' } },
      { status: () => ({ json: () => {} }) },
      () => { areaAdminNextCalled = true; },
    );
    assert.equal(areaAdminNextCalled, true);

    let platformAdminStatus;
    requireAreaAdmin(
      { user: { role: 'admin', adminType: 'platform' } },
      {
        status(status) {
          platformAdminStatus = status;
          return { json: () => {} };
        },
      },
      () => assert.fail('Platform Admin must not reach the inbox handler'),
    );
    assert.equal(platformAdminStatus, 403);
  });
});
