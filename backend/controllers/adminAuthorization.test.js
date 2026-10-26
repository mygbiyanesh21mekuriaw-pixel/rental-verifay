const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Property = require('../models/Property');
const systemLogRoutes = require('../routes/systemLogRoutes');
const adminRoutes = require('../routes/adminRoutes');
const adminAccountRoutes = require('../routes/adminAccountRoutes');
const { deleteAreaAdminAccount } = require('./adminController');
const { platformAdminOnly } = require('../middleware/auth');
const { getAdminProperties, getPendingProperties, getAllUsers } = require('./adminController');
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
    assert.ok(propertyFilter.$and[0].$or[0].area instanceof RegExp);
    assert.equal(propertyFilter.$and[0].$or[0].city, undefined);
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

test('user status route allows only authenticated admins', () => {
  const route = adminRoutes.stack.find((layer) =>
    layer.route?.path === '/users/:id/active' && layer.route.methods.patch);

  assert.ok(route);
  assert.equal(route.route.stack[0].handle.name, 'auth');
  assert.deepEqual(route.route.stack[1].handle.toString(), requireRole('platform_admin', 'area_admin').toString());
});

test('Area Admin delete routes reject deletion and require Platform Admin authorization', () => {
  const routes = [
    [adminAccountRoutes, '/:id'],
    [adminRoutes, '/users/admin/:id'],
  ];

  routes.forEach(([router, path]) => {
    const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods.delete);

    assert.ok(route);
    assert.equal(route.route.stack[0].handle.name, 'auth');
    assert.equal(route.route.stack[1].handle, platformAdminOnly);
    assert.equal(route.route.stack.at(-1).handle, deleteAreaAdminAccount);
  });
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

test('Area Admin user list is derived from properties and rentals in the assigned area', async () => {
  const originals = {
    userFind: User.find,
    propertyFind: Property.find,
    rentalFind: require('../models/RentalRequest').find,
  };
  let userFilter;
  let propertyFilter;
  let rentalFilter;
  Property.find = (filter) => {
    propertyFilter = filter;
    return { select: () => ({ lean: async () => [{ _id: 'area-property', landlord: 'landlord-id' }] }) };
  };
  require('../models/RentalRequest').find = (filter) => {
    rentalFilter = filter;
    return { select: () => ({ lean: async () => [{ tenant: 'tenant-id', landlord: 'landlord-id' }] }) };
  };
  User.find = (filter) => {
    userFilter = filter;
    return { select: () => ({ lean: async () => [] }) };
  };
  const response = createResponse();

  try {
    await getAllUsers({
      user: { role: 'admin', adminType: 'area', assignedArea: 'Mekelle' },
    }, response);

    assert.ok(propertyFilter.$or[0].area instanceof RegExp);
    assert.deepEqual(rentalFilter, { property: { $in: ['area-property'] } });
    assert.deepEqual(userFilter, {
      _id: { $in: ['landlord-id', 'tenant-id'] },
      role: { $in: ['landlord', 'tenant'] },
    });
    assert.deepEqual(response.body, []);
  } finally {
    User.find = originals.userFind;
    Property.find = originals.propertyFind;
    require('../models/RentalRequest').find = originals.rentalFind;
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

    assert.ok(propertyFilter.$and[0].area instanceof RegExp);
    assert.equal(propertyFilter.$and[0].city, undefined);
    assert.deepEqual(response.body, []);
  } finally {
    User.findById = originalUserFindById;
    Property.find = originalPropertyFind;
  }
});

test('Under Review property query uses only the Area Admin assigned property area', async () => {
  const originals = { findById: User.findById, propertyFind: Property.find };
  let propertyFilter;
  User.findById = () => ({
    select() {
      return {
        lean: async () => ({
          adminType: 'area',
          assignedArea: 'Dessie',
          adminAreas: [{ city: 'Dessie' }],
        }),
      };
    },
  });
  Property.find = (filter) => {
    propertyFilter = filter;
    return {
      populate() {
        return this;
      },
      lean: async () => [],
    };
  };
  const response = createResponse();

  try {
    await getPendingProperties({ user: { id: 'area-admin-id' }, params: {} }, response);
    assert.equal(propertyFilter.verificationStatus, 'pending');
    assert.equal(propertyFilter.isVerified, false);
    assert.ok(propertyFilter.$and[0].area instanceof RegExp);
    assert.equal(propertyFilter.$and[0].city, undefined);
    assert.deepEqual(response.body, []);
  } finally {
    User.findById = originals.findById;
    Property.find = originals.propertyFind;
  }
});
