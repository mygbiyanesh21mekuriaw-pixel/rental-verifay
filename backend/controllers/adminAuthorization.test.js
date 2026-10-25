const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Property = require('../models/Property');
const systemLogRoutes = require('../routes/systemLogRoutes');
const adminRoutes = require('../routes/adminRoutes');
const { platformAdminOnly } = require('../middleware/auth');
const { getAdminProperties, getAllUsers } = require('./adminController');
const { requireRole } = require('../middleware/auth');

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

test('role changes are restricted to Platform Admins', () => {
  const route = adminRoutes.stack.find((layer) => layer.route?.path === '/users/:id/role');

  assert.ok(route);
  assert.equal(route.route.stack[0].handle.name, 'auth');
  assert.equal(route.route.stack[1].handle, platformAdminOnly);
});

test('area-admin role is derived from legacy admin fields and exposes its assigned area', () => {
  const middleware = requireRole('area_admin');
  const req = { user: { role: 'admin', adminType: 'area', assignedArea: 'Mekelle' } };
  let nextCalled = false;

  middleware(req, createResponse(), () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.accessRole, 'area_admin');
});

test('platform-admin role middleware rejects area admins', () => {
  const middleware = requireRole('platform_admin');
  const req = { user: { role: 'admin', adminType: 'area' } };
  const response = createResponse();

  middleware(req, response, () => assert.fail('Unauthorized role passed middleware'));

  assert.equal(response.statusCode, 403);
});

test('area-admin user query is restricted to the assigned area', async () => {
  const originalUserFind = User.find;
  let query;
  User.find = (filter) => {
    query = filter;
    return { select: async () => [] };
  };
  const response = createResponse();

  try {
    await getAllUsers({
      user: { role: 'admin', adminType: 'area', assignedArea: 'Mekelle' },
    }, response);

    assert.deepEqual(query, { area: 'Mekelle' });
    assert.deepEqual(response.body, []);
  } finally {
    User.find = originalUserFind;
  }
});

test('area-admin property query matches only the assigned area', async () => {
  const originalUserFindById = User.findById;
  const originalPropertyFind = Property.find;
  let propertyFilter;
  User.findById = () => ({
    select() {
      return {
        lean: async () => ({
          adminType: 'area',
          assignedArea: 'North',
          adminAreas: [{ city: 'North' }],
        }),
      };
    },
  });
  Property.find = (filter) => {
    propertyFilter = filter;
    return { sort: () => ({ lean: async () => [] }) };
  };
  const response = createResponse();

  try {
    await getAdminProperties(
      { user: { id: '507f1f77bcf86cd799439011' }, query: { status: 'all' }, params: {} },
      response,
    );

    assert.ok(propertyFilter.$and[0].$or.some((condition) => condition.area instanceof RegExp));
    assert.deepEqual(response.body, []);
  } finally {
    User.findById = originalUserFindById;
    Property.find = originalPropertyFind;
  }
});
