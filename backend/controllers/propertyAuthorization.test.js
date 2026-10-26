const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const User = require('../models/User');
const Area = require('../models/Area');
const RentalRequest = require('../models/RentalRequest');
const SystemSettings = require('../models/SystemSettings');
const { createProperty, getAllProperties, getPropertyById } = require('./propertyController');

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
  const originalSettingsFindOne = SystemSettings.findOne;
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
  SystemSettings.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  const response = createResponse();

  try {
    await getAllProperties({
      user: { id: 'admin-id', role: 'admin', adminType: 'area', adminAreas: areaAdmin.adminAreas },
      query: { search: 'outside-area' },
    }, response);

    assert.equal(response.statusCode, null);
    assert.ok(Array.isArray(requestedFilter.$and));
    assert.ok(requestedFilter.$and.some((condition) => condition.$or?.some((area) => area.area?.test('Mekelle'))));
    assert.equal(requestedFilter.$and.some((condition) => condition.$or?.some((area) => area.city)), false);
    assert.ok(requestedFilter.$or.some((condition) => condition.title));
    assert.deepEqual(response.body, []);
  } finally {
    User.findById = originalUserFindById;
    Property.find = originalPropertyFind;
    SystemSettings.findOne = originalSettingsFindOne;
  }
});

test('property creation derives area from address and ignores a client-sent area', async () => {
  const originalAreaFind = Area.find;
  const originalUserFindOne = User.findOne;
  const response = createResponse();
  const body = {
    title: 'Test property',
    description: 'A test property',
    price: 1000,
    bedrooms: 1,
    region: 'Amhara',
    zone: 'South Wollo',
    wereda: 'Dessie',
    city: 'Dessie',
    area: 'Client controlled area',
    subCity: 'Central',
    kebele: '1',
    houseNumber: '1',
  };
  Area.find = () => ({
    select: () => ({ lean: async () => [{
      name: 'Dessie',
      addressMapping: { region: 'Amhara', zone: 'South Wollo', city: 'Dessie' },
    }] }),
  });
  User.findOne = () => ({ select: async () => ({ _id: 'landlord-id' }) });

  try {
    await createProperty({ body, user: { id: 'landlord-id' } }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'Verification document is required');
  } finally {
    Area.find = originalAreaFind;
    User.findOne = originalUserFindOne;
  }
});

test('property creation treats an unmapped address as unassigned instead of rejecting it', async () => {
  const originalAreaFind = Area.find;
  const originalUserFindOne = User.findOne;
  const response = createResponse();
  Area.find = () => ({ select: () => ({ lean: async () => [] }) });
  User.findOne = () => ({ select: async () => ({ _id: 'landlord-id' }) });

  try {
    await createProperty({
      body: {
        title: 'Test property',
        description: 'A test property',
        price: 1000,
        bedrooms: 1,
        area: 'Dessie',
        region: 'Amhara',
        zone: 'South Wollo',
        wereda: 'Dessie',
        city: 'Dessie',
        subCity: 'Central',
        kebele: '1',
        houseNumber: '1',
      },
      user: { id: 'landlord-id' },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'Verification document is required');
  } finally {
    Area.find = originalAreaFind;
    User.findOne = originalUserFindOne;
  }
});

test('property schema requires its own area field', () => {
  assert.equal(Property.schema.path('area').options.required, true);
});

test('tenant property browsing does not require or filter by the tenant registered area', async () => {
  const originals = {
    userFind: User.find,
    propertyFind: Property.find,
    settingsFindOne: SystemSettings.findOne,
  };
  let propertyFilter;
  User.find = () => ({
    select: () => ({ lean: async () => [{ _id: 'landlord-id' }] }),
  });
  Property.find = (filter) => {
    propertyFilter = filter;
    return createFindQuery([]);
  };
  SystemSettings.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
  const response = createResponse();

  try {
    await getAllProperties({
      user: { id: 'tenant-id', role: 'tenant', area: '' },
      query: {},
    }, response);
    assert.equal(response.statusCode, null);
    assert.deepEqual(response.body, []);
    assert.equal(propertyFilter.area, undefined);
  } finally {
    User.find = originals.userFind;
    Property.find = originals.propertyFind;
    SystemSettings.findOne = originals.settingsFindOne;
  }
});

test('landlord cannot read another landlord property by changing the property ID', async () => {
  const originalPropertyFindById = Property.findById;
  const originalRentalRequestExists = RentalRequest.exists;
  const originalSettingsFindOne = SystemSettings.findOne;
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
  SystemSettings.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
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
    SystemSettings.findOne = originalSettingsFindOne;
  }
});

test('property owner retains access to their verification document', async () => {
  const originalPropertyFindById = Property.findById;
  const originalSettingsFindOne = SystemSettings.findOne;
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
  SystemSettings.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => null,
  });
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
    SystemSettings.findOne = originalSettingsFindOne;
  }
});
