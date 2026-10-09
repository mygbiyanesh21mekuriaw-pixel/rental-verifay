const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const User = require('../models/User');
const RentalRequest = require('../models/RentalRequest');
const { getAllProperties, getPropertyById } = require('./propertyController');

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

const createFindQuery = (records) => ({
  populate() {
    return this;
  },
  sort() {
    return Promise.resolve(records);
  },
});

const createPropertyByIdQuery = (property) => ({
  populate() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(property).then(resolve, reject);
  },
});

test('area-admin property search retains the assigned-area constraint', async () => {
  const originalUserFindById = User.findById;
  const originalPropertyFind = Property.find;
  const areaAdmin = {
    adminType: 'area',
    adminAreas: [{ city: 'Mekelle' }],
  };
  let requestedFilter;
  User.findById = () => ({
    select() {
      return { lean: async () => areaAdmin };
    },
  });
  Property.find = (filter) => {
    requestedFilter = filter;
    return createFindQuery([]);
  };
  const response = createResponse();

  try {
    await getAllProperties({
      user: { id: 'admin-id', role: 'admin', adminType: 'area', adminAreas: areaAdmin.adminAreas },
      query: { search: 'outside-area' },
    }, response);

    assert.equal(response.statusCode, null);
    assert.ok(Array.isArray(requestedFilter.$and));
    assert.ok(requestedFilter.$and.some((condition) => condition.$or?.some((area) => area.city)));
    assert.ok(requestedFilter.$or.some((condition) => condition.title));
    assert.deepEqual(response.body, []);
  } finally {
    User.findById = originalUserFindById;
    Property.find = originalPropertyFind;
  }
});

test('landlord cannot read another landlord property by changing the property ID', async () => {
  const originalPropertyFindById = Property.findById;
  const originalRentalRequestExists = RentalRequest.exists;
  const property = {
    _id: 'property-b',
    landlord: { _id: 'landlord-b' },
    isVerified: false,
    verificationStatus: 'pending',
    verificationDocument: 'https://example.test/uploads/private-proof.png',
    toObject() {
      return { ...this };
    },
  };
  Property.findById = () => createPropertyByIdQuery(property);
  RentalRequest.exists = async () => false;
  const response = createResponse();

  try {
    await getPropertyById(
      { params: { id: 'property-b' }, user: { id: 'landlord-a', role: 'landlord' } },
      response,
    );
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.message, 'Property not found');
    assert.equal(property.verificationDocument, 'https://example.test/uploads/private-proof.png');
  } finally {
    Property.findById = originalPropertyFindById;
    RentalRequest.exists = originalRentalRequestExists;
  }
});

test('property owner retains access to their verification document', async () => {
  const originalPropertyFindById = Property.findById;
  const property = {
    _id: 'property-b',
    landlord: { _id: 'landlord-b' },
    isVerified: false,
    verificationStatus: 'pending',
    verificationDocument: 'https://example.test/uploads/private-proof.png',
    toObject() {
      return { ...this };
    },
  };
  Property.findById = () => createPropertyByIdQuery(property);
  const response = createResponse();

  try {
    await getPropertyById(
      { params: { id: 'property-b' }, user: { id: 'landlord-b', role: 'landlord' } },
      response,
    );
    assert.equal(response.statusCode, null);
    assert.equal(response.body.hasVerificationDocument, true);
    assert.equal(response.body.verificationDocument, undefined);
  } finally {
    Property.findById = originalPropertyFindById;
  }
});
