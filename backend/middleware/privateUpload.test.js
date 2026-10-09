const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const { privateUploadAccess } = require('./privateUpload');

const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'private-upload-test-secret';

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
  end() {
    this.ended = true;
    return this;
  },
});

const createLeanQuery = (value) => ({
  select() {
    return this;
  },
  lean() {
    return Promise.resolve(value);
  },
});

const makeRequest = (user, token) => ({
  path: '/proof-1.png',
  header: (name) => name === 'Authorization' && token ? `Bearer ${token}` : undefined,
});

test('verification document upload is private to its landlord and authorized admins', async () => {
  const originalUserFindById = User.findById;
  const originalPropertyFindOne = Property.findOne;
  const originalVerificationFindOne = VerificationRequest.findOne;
  const property = {
    _id: '507f1f77bcf86cd799439099',
    landlord: '507f1f77bcf86cd799439002',
    city: 'Mekelle',
  };
  const activeUsers = new Map([
    ['507f1f77bcf86cd799439001', { _id: '507f1f77bcf86cd799439001', role: 'landlord', adminAreas: [] }],
    ['507f1f77bcf86cd799439002', { _id: '507f1f77bcf86cd799439002', role: 'landlord', adminAreas: [] }],
    ['507f1f77bcf86cd799439003', { _id: '507f1f77bcf86cd799439003', role: 'admin', adminType: 'area', adminAreas: [{ city: 'Mekelle' }] }],
  ]);
  User.findById = (id) => createLeanQuery(activeUsers.get(String(id)));
  Property.findOne = () => createLeanQuery(property);
  VerificationRequest.findOne = () => createLeanQuery(null);

  try {
    const publicResponse = createResponse();
    let publicNextCalled = false;
    await privateUploadAccess(makeRequest(), publicResponse, () => { publicNextCalled = true; });
    assert.equal(publicResponse.statusCode, 401);
    assert.equal(publicNextCalled, false);

    const otherLandlordToken = jwt.sign({ id: '507f1f77bcf86cd799439001', role: 'landlord' }, process.env.JWT_SECRET);
    const otherLandlordResponse = createResponse();
    let otherLandlordNextCalled = false;
    await privateUploadAccess(
      makeRequest(null, otherLandlordToken),
      otherLandlordResponse,
      () => { otherLandlordNextCalled = true; },
    );
    assert.equal(otherLandlordResponse.statusCode, 404);
    assert.equal(otherLandlordNextCalled, false);

    const ownerToken = jwt.sign({ id: '507f1f77bcf86cd799439002', role: 'tenant' }, process.env.JWT_SECRET);
    let ownerNextCalled = false;
    await privateUploadAccess(
      makeRequest(null, ownerToken),
      createResponse(),
      () => { ownerNextCalled = true; },
    );
    assert.equal(ownerNextCalled, true);

    const areaAdminToken = jwt.sign({ id: '507f1f77bcf86cd799439003', role: 'admin', adminType: 'platform' }, process.env.JWT_SECRET);
    let areaAdminNextCalled = false;
    await privateUploadAccess(
      makeRequest(null, areaAdminToken),
      createResponse(),
      () => { areaAdminNextCalled = true; },
    );
    assert.equal(areaAdminNextCalled, true);
  } finally {
    User.findById = originalUserFindById;
    Property.findOne = originalPropertyFindOne;
    VerificationRequest.findOne = originalVerificationFindOne;
  }
});

test.after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
