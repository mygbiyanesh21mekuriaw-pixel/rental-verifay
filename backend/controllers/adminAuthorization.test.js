const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Property = require('../models/Property');
const systemLogRoutes = require('../routes/systemLogRoutes');
const { platformAdminOnly } = require('../middleware/auth');
const { getAdminProperties } = require('./adminController');

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

test('legacy area admins remain scoped when loading administrative properties', async () => {
  const originalUserFindById = User.findById;
  const originalPropertyFind = Property.find;
  let propertyFilter;
  User.findById = () => ({
    select() {
      return { lean: async () => ({ adminAreas: [{ city: 'Mekelle' }] }) };
    },
  });
  Property.find = (filter) => {
    propertyFilter = filter;
    return {
      sort() {
        return { lean: async () => [] };
      },
    };
  };
  const response = createResponse();

  try {
    await getAdminProperties(
      { user: { id: '507f1f77bcf86cd799439011' }, query: { status: 'all' }, params: {} },
      response,
    );

    assert.equal(response.statusCode, null);
    assert.ok(propertyFilter.$and[0].$or[0].city instanceof RegExp);
    assert.deepEqual(response.body, []);
  } finally {
    User.findById = originalUserFindById;
    Property.find = originalPropertyFind;
  }
});

test('system-log route requires platform-admin authorization', () => {
  const route = systemLogRoutes.stack.find((layer) => layer.route?.path === '/system-logs');

  assert.ok(route);
  assert.equal(route.route.stack[0].handle.name, 'auth');
  assert.equal(route.route.stack[1].handle, platformAdminOnly);
});
