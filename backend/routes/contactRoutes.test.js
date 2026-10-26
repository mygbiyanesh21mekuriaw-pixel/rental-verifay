const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('./contactRoutes');
const { platformAdminOnly } = require('../middleware/auth');

const getRoute = (method, path) => router.stack
  .map((layer) => layer.route)
  .find((route) => route?.path === path && route.methods[method]);

test('Area Admin and Platform Admin contact inbox routes use their matching role guards', () => {
  const areaRoute = getRoute('get', '/area-admin/inbox');
  const platformRoute = getRoute('get', '/platform-admin/inbox');
  assert.ok(areaRoute);
  assert.ok(platformRoute);

  let areaNextCalled = false;
  areaRoute.stack[1].handle(
    { user: { role: 'admin', adminType: 'area' } },
    { status: () => ({ json: () => {} }) },
    () => { areaNextCalled = true; },
  );
  assert.equal(areaNextCalled, true);

  assert.equal(platformRoute.stack[1].handle, platformAdminOnly);
  let platformNextCalled = false;
  platformRoute.stack[1].handle(
    { user: { role: 'admin', adminType: 'platform' } },
    { status: () => ({ json: () => {} }) },
    () => { platformNextCalled = true; },
  );
  assert.equal(platformNextCalled, true);
});
