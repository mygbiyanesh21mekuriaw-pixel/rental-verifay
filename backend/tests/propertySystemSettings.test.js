const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const SystemSettings = require('../models/SystemSettings');
const {
  getAllProperties,
  getPropertyById,
} = require('../controllers/propertyController');

const callController = async (controller, req = {}) => {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await controller(req, res);
  return result;
};

test('disabling review makes pending properties publicly discoverable without changing their status', async () => {
  const originalFindOne = SystemSettings.findOne;
  const originalFind = Property.find;
  const property = {
    _id: { toString: () => 'pending-property' },
    isVerified: false,
    verificationStatus: 'pending',
    availabilityStatus: 'available',
  };
  let queryFilter;
  SystemSettings.findOne = () => ({
    select: () => ({ lean: async () => ({ properties: { requireAdminReview: false } }) }),
  });
  Property.find = (filter) => {
    queryFilter = filter;
    const query = {
      populate() { return this; },
      sort: async () => [property],
    };
    return query;
  };

  try {
    const result = await callController(getAllProperties, { query: {} });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, [{ ...property, hasVerificationDocument: false }]);
    assert.deepEqual(queryFilter.$and[0], {
      $or: [
        { isVerified: true, verificationStatus: 'approved' },
        { isVerified: false, verificationStatus: 'pending' },
      ],
    });
    assert.equal(property.verificationStatus, 'pending');
    assert.equal(property.isVerified, false);
  } finally {
    SystemSettings.findOne = originalFindOne;
    Property.find = originalFind;
  }
});

test('disabling review does not expose rejected properties by ID', async () => {
  const originalFindOne = SystemSettings.findOne;
  const originalFindById = Property.findById;
  const property = {
    _id: 'rejected-property',
    isVerified: false,
    verificationStatus: 'rejected',
    availabilityStatus: 'available',
  };
  SystemSettings.findOne = () => ({
    select: () => ({ lean: async () => ({ properties: { requireAdminReview: false } }) }),
  });
  Property.findById = () => ({
    populate: async () => property,
  });

  try {
    const result = await callController(getPropertyById, {
      params: { id: 'rejected-property' },
    });
    assert.equal(result.statusCode, 403);
    assert.equal(property.verificationStatus, 'rejected');
    assert.equal(property.isVerified, false);
  } finally {
    SystemSettings.findOne = originalFindOne;
    Property.findById = originalFindById;
  }
});
