const test = require('node:test');
const assert = require('node:assert/strict');
const Area = require('../models/Area');
const User = require('../models/User');
const areaRoutes = require('../routes/areaRoutes');
const { deleteArea } = require('./areaController');

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

test('all Area CRUD routes follow authentication and platform-admin middleware', () => {
  assert.equal(areaRoutes.stack[0].name, 'auth');
  assert.equal(typeof areaRoutes.stack[1].handle, 'function');
  assert.deepEqual(
    areaRoutes.stack
      .filter((layer) => layer.route)
      .map((layer) => [Object.keys(layer.route.methods)[0], layer.route.path]),
    [
      ['get', '/'],
      ['post', '/'],
      ['put', '/:id'],
      ['delete', '/:id'],
    ],
  );
});

test('deleting a place assigned to an admin is rejected', async () => {
  const originalFindById = Area.findById;
  const originalExists = User.exists;
  let checkedAdminFilter;
  Area.findById = () => ({
    select: async () => ({ name: 'North' }),
  });
  User.exists = async (filter) => {
    checkedAdminFilter = filter;
    return { _id: 'assigned-admin' };
  };
  const response = createResponse();

  try {
    await deleteArea({ params: { id: '507f1f77bcf86cd799439011' } }, response);

    assert.equal(response.statusCode, 409);
    assert.match(response.body.message, /assigned to an admin/);
    assert.equal(checkedAdminFilter.role, 'admin');
    assert.ok(checkedAdminFilter.$or.some((condition) => condition.assignedArea instanceof RegExp));
  } finally {
    Area.findById = originalFindById;
    User.exists = originalExists;
  }
});
