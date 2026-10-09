const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  auth,
  adminOnly,
  platformAdminOnly,
  landlordOwnerOrPlatformAdmin,
} = require('./auth');
const Property = require('../models/Property');

const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'auth-middleware-test-secret';

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

const createUserQuery = (user) => ({
  select() {
    return this;
  },
  lean() {
    return Promise.resolve(user);
  },
  then(resolve, reject) {
    return Promise.resolve(user).then(resolve, reject);
  },
});

const createPropertyQuery = (property) => ({
  select() {
    return Promise.resolve(property);
  },
});

const makeRequest = (token) => ({
  header: () => token ? `Bearer ${token}` : undefined,
  params: { id: 'property-id' },
});

test('auth rejects a missing token', async () => {
  const response = createResponse();
  let nextCalled = false;

  await auth(makeRequest(), response, () => { nextCalled = true; });

  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('auth rejects invalid and expired tokens', async () => {
  const invalidResponse = createResponse();
  await auth(makeRequest('not-a-jwt'), invalidResponse, () => {});
  assert.equal(invalidResponse.statusCode, 401);

  const expiredToken = jwt.sign(
    { id: '507f1f77bcf86cd799439011', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: -1 },
  );
  const expiredResponse = createResponse();
  await auth(makeRequest(expiredToken), expiredResponse, () => {});
  assert.equal(expiredResponse.statusCode, 401);
});

test('auth rejects a deleted account even when its JWT is still valid', async () => {
  const originalFindById = User.findById;
  User.findById = () => createUserQuery(null);
  const token = jwt.sign({ id: '507f1f77bcf86cd799439011', role: 'admin' }, process.env.JWT_SECRET);
  const response = createResponse();
  let nextCalled = false;

  try {
    await auth(makeRequest(token), response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 401);
    assert.equal(nextCalled, false);
  } finally {
    User.findById = originalFindById;
  }
});

test('auth uses the current database role instead of a stale elevated JWT role', async () => {
  const originalFindById = User.findById;
  const tenant = {
    _id: '507f1f77bcf86cd799439011',
    role: 'tenant',
    adminAreas: [],
  };
  User.findById = () => createUserQuery(tenant);
  const token = jwt.sign({ id: tenant._id, role: 'admin' }, process.env.JWT_SECRET);
  const response = createResponse();
  let nextCalled = false;

  try {
    const request = makeRequest(token);
    await auth(request, response, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.deepEqual(request.user, {
      id: tenant._id,
      role: 'tenant',
      adminType: undefined,
      adminAreas: [],
    });

    const adminResponse = createResponse();
    adminOnly(request, adminResponse, () => {});
    assert.equal(adminResponse.statusCode, 403);
  } finally {
    User.findById = originalFindById;
  }
});

test('area admin cannot use platform-admin-only permissions', async () => {
  const originalFindById = User.findById;
  const areaAdmin = {
    _id: '507f1f77bcf86cd799439012',
    role: 'admin',
    adminType: 'area',
    adminAreas: [{ city: 'Mekelle' }],
  };
  User.findById = () => createUserQuery(areaAdmin);
  const token = jwt.sign({ id: areaAdmin._id, role: 'admin', adminType: 'platform' }, process.env.JWT_SECRET);
  const response = createResponse();

  try {
    const request = makeRequest(token);
    await auth(request, response, () => {});
    const permissionResponse = createResponse();
    await platformAdminOnly(request, permissionResponse, () => {});
    assert.equal(permissionResponse.statusCode, 403);
    assert.match(permissionResponse.body.message, /Platform Admin permission required/);
  } finally {
    User.findById = originalFindById;
  }
});

test('property mutation authorization permits only the owner or a platform admin', async () => {
  const originalFindById = Property.findById;
  const property = {
    _id: 'property-id',
    landlord: 'landlord-b',
  };
  Property.findById = () => createPropertyQuery(property);

  try {
    const landlordAResponse = createResponse();
    let landlordANextCalled = false;
    await landlordOwnerOrPlatformAdmin(
      { params: { id: property._id }, user: { id: 'landlord-a', role: 'landlord' } },
      landlordAResponse,
      () => { landlordANextCalled = true; },
    );
    assert.equal(landlordAResponse.statusCode, 403);
    assert.equal(landlordANextCalled, false);
    assert.equal(property.landlord, 'landlord-b');

    let ownerNextCalled = false;
    await landlordOwnerOrPlatformAdmin(
      { params: { id: property._id }, user: { id: 'landlord-b', role: 'landlord' } },
      createResponse(),
      () => { ownerNextCalled = true; },
    );
    assert.equal(ownerNextCalled, true);

    const areaResponse = createResponse();
    let areaNextCalled = false;
    await landlordOwnerOrPlatformAdmin(
      { params: { id: property._id }, user: { id: 'admin-a', role: 'admin', adminType: 'area' } },
      areaResponse,
      () => { areaNextCalled = true; },
    );
    assert.equal(areaResponse.statusCode, 403);
    assert.equal(areaNextCalled, false);

    let platformNextCalled = false;
    await landlordOwnerOrPlatformAdmin(
      { params: { id: property._id }, user: { id: 'admin-p', role: 'admin', adminType: 'platform' } },
      createResponse(),
      () => { platformNextCalled = true; },
    );
    assert.equal(platformNextCalled, true);
  } finally {
    Property.findById = originalFindById;
  }
});

test.after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
