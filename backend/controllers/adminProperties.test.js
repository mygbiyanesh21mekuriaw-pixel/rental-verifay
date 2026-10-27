const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const User = require('../models/User');
const { getAdminProperties, getAdminPropertyDetails } = require('./adminController');

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

const createQuery = (value) => ({
  select() { return this; },
  sort() { return this; },
  skip() { return this; },
  limit() { return this; },
  lean() { return Promise.resolve(value); },
});

const withPropertyMocks = async (mocks, callback) => {
  const originals = {
    find: Property.find,
    findById: Property.findById,
    countDocuments: Property.countDocuments,
    distinct: Property.distinct,
    userFind: User.find,
    userFindById: User.findById,
  };
  Object.assign(Property, {
    find: mocks.find || originals.find,
    findById: mocks.findById || originals.findById,
    countDocuments: mocks.countDocuments || originals.countDocuments,
    distinct: mocks.distinct || originals.distinct,
  });
  User.find = mocks.userFind || originals.userFind;
  User.findById = mocks.userFindById || originals.userFindById;
  try {
    await callback();
  } finally {
    Property.find = originals.find;
    Property.findById = originals.findById;
    Property.countDocuments = originals.countDocuments;
    Property.distinct = originals.distinct;
    User.find = originals.userFind;
    User.findById = originals.userFindById;
  }
};

test('paginated property listing applies search, area, price, status and sort filters with filtered totals', async () => {
  const captured = {};
  const admin = { _id: '507f1f77bcf86cd799439011', role: 'admin', adminType: 'platform', isActive: true };
  await withPropertyMocks({
    find: (filter) => {
      captured.listFilter = filter;
      return {
        sort(sort) {
          captured.sort = sort;
          return this;
        },
        skip(skip) {
          captured.skip = skip;
          return this;
        },
        limit(limit) {
          captured.limit = limit;
          return this;
        },
        lean: async () => [],
      };
    },
    countDocuments: async (filter) => {
      captured.countFilters = [...(captured.countFilters || []), filter];
      if (filter.verificationStatus === 'approved') return 7;
      if (filter.verificationStatus === 'pending') return 3;
      if (filter.verificationStatus === 'rejected') return 2;
      return 12;
    },
    distinct: async (field, filter) => {
      captured.distinct = { field, filter };
      return ['Mekelle', 'Addis Ababa'];
    },
    userFind: () => ({ select() { return { lean: async () => [] }; } }),
    userFindById: () => createQuery(admin),
  }, async () => {
    const response = createResponse();
    await getAdminProperties({
      user: { id: admin._id, role: 'admin', adminType: 'platform_admin' },
      query: {
        q: 'City*',
        status: 'pending',
        area: 'Mekelle',
        minPrice: '1000',
        maxPrice: '5000',
        page: '2',
        limit: '12',
        sort: 'price-asc',
      },
      params: {},
    }, response);

    assert.equal(response.statusCode, null);
    assert.equal(response.body.pagination.page, 2);
    assert.equal(response.body.pagination.limit, 12);
    assert.equal(response.body.pagination.total, 3);
    assert.deepEqual(response.body.totals, { total: 12, verified: 7, underReview: 3, rejected: 2 });
    assert.equal(captured.skip, 12);
    assert.equal(captured.sort.price, 1);
    assert.equal(captured.listFilter.verificationStatus, 'pending');
    assert.equal(captured.listFilter.isVerified, false);
    assert.equal(captured.listFilter.area.test('Mekelle'), true);
    assert.deepEqual(captured.listFilter.price, { $gte: 1000, $lte: 5000 });
    assert.equal(captured.listFilter.$and[0].$or[0].title.test('CITY*'), true);
    assert.equal(response.body.areas.length, 2);
  });
});

test('property list responses never include ownership proof values or metadata', async () => {
  const admin = { _id: '507f1f77bcf86cd799439011', role: 'admin', adminType: 'platform', isActive: true };
  const property = {
    _id: '507f1f77bcf86cd799439012',
    title: 'Private proof listing',
    verificationStatus: 'approved',
    isVerified: true,
    landlord: '507f1f77bcf86cd799439013',
    verificationDocument: 'https://private.example/proof.png',
    verificationDocumentAsset: { publicId: 'private/proof' },
    history: [],
  };
  await withPropertyMocks({
    find: () => ({
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      lean: async () => [property],
    }),
    countDocuments: async () => 1,
    distinct: async () => ['Mekelle'],
    userFindById: () => createQuery(admin),
    userFind: () => ({
      select() {
        return { lean: async () => [{ _id: property.landlord, role: 'landlord', name: 'Owner' }] };
      },
    }),
  }, async () => {
    const response = createResponse();
    await getAdminProperties({
      user: { id: admin._id, role: 'admin', adminType: 'platform_admin' },
      query: { status: 'all', page: '1', limit: '12' },
      params: {},
    }, response);

    assert.equal(response.body.properties[0].hasVerificationDocument, undefined);
    assert.equal(response.body.properties[0].verificationDocument, undefined);
    assert.equal(response.body.properties[0].verificationDocumentAsset, undefined);
  });
});

test('property details authorize platform admins, owning landlords and only the assigned Area Admin', async () => {
  const property = {
    _id: '507f1f77bcf86cd799439012',
    landlord: '507f1f77bcf86cd799439013',
    area: 'Mekelle',
    verificationStatus: 'approved',
    isVerified: true,
    description: 'Full property description',
    verificationDocument: 'https://private.example/proof.png',
    verificationDocumentAsset: { publicId: 'private/proof' },
    history: [{ action: 'verified', byName: 'Area Admin', at: new Date('2026-01-01') }],
  };
  const users = {
    platform: { _id: '507f1f77bcf86cd799439011', role: 'admin', adminType: 'platform', isActive: true },
    area: { _id: '507f1f77bcf86cd799439014', role: 'admin', adminType: 'area', assignedArea: 'Mekelle', isActive: true },
    wrongArea: { _id: '507f1f77bcf86cd799439015', role: 'admin', adminType: 'area', assignedArea: 'Adama', isActive: true },
    landlord: { _id: property.landlord, role: 'landlord', isActive: true },
    tenant: { _id: '507f1f77bcf86cd799439016', role: 'tenant', isActive: true },
  };

  await withPropertyMocks({
    findById: () => createQuery(property),
    userFindById: (id) => createQuery(id === property.landlord
      ? { _id: property.landlord, role: 'landlord', name: 'Owner' }
      : Object.values(users).find((user) => String(user._id) === String(id))),
  }, async () => {
    for (const [userKey, expectedStatus] of [
      ['platform', null],
      ['area', null],
      ['landlord', null],
      ['wrongArea', 403],
      ['tenant', 403],
    ]) {
      const response = createResponse();
      await getAdminPropertyDetails({
        params: { id: property._id },
        user: { id: users[userKey]._id },
      }, response);
      assert.equal(response.statusCode, expectedStatus, `${userKey} access status`);
      if (expectedStatus === null) {
        assert.equal(response.body.description, 'Full property description');
        assert.equal(response.body.history.length, 1);
        assert.equal(response.body.hasVerificationDocument, true);
        assert.equal(response.body.verificationDocument, undefined);
        assert.equal(response.body.verificationDocumentAsset, undefined);
      }
    }
  });
});
