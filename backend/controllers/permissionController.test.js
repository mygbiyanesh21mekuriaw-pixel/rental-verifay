const test = require('node:test');
const assert = require('node:assert/strict');
const { getMyPermissions } = require('./permissionController');

test('GET /api/permissions/me returns enabled keys only', () => {
  const response = {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };
  getMyPermissions({ user: { permissions: { dashboard: true, messages: false, accountSettings: true } } }, response);
  assert.deepEqual(response.body, { permissions: ['dashboard', 'accountSettings'] });
});