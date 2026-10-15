const test = require('node:test');
const assert = require('node:assert/strict');
const RentRequest = require('../models/RentalRequest');
const {
  getLandlordRentalRequests,
  landlordRespondToRequest,
} = require('./rentalRequestController');

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

test('landlord response accepts only approved or rejected status values', async () => {
  const originalFindById = RentRequest.findById;
  RentRequest.findById = () => {
    throw new Error('A request must not be loaded for an invalid status');
  };
  const response = createResponse();

  try {
    await landlordRespondToRequest({
      params: { id: '507f1f77bcf86cd799439011' },
      body: { status: 'confirmed', landlord: 'another-user' },
      user: { id: '507f1f77bcf86cd799439012', role: 'landlord' },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /Status must be approved or rejected/);
  } finally {
    RentRequest.findById = originalFindById;
  }
});

test('landlord rental requests can be limited while remaining sorted newest first', async () => {
  const originalFind = RentRequest.find;
  const calls = { filter: null, sort: null, limit: null };
  const query = {
    populate() {
      return this;
    },
    sort(sort) {
      calls.sort = sort;
      return this;
    },
    limit(limit) {
      calls.limit = limit;
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve([{ _id: 'newest-request' }]).then(resolve, reject);
    },
  };
  RentRequest.find = (filter) => {
    calls.filter = filter;
    return query;
  };
  const response = createResponse();

  try {
    await getLandlordRentalRequests({
      query: { limit: '5' },
      user: { id: '507f1f77bcf86cd799439012' },
    }, response);

    assert.deepEqual(calls.filter, { landlord: '507f1f77bcf86cd799439012' });
    assert.deepEqual(calls.sort, { createdAt: -1 });
    assert.equal(calls.limit, 5);
    assert.deepEqual(response.body, [{ _id: 'newest-request' }]);
  } finally {
    RentRequest.find = originalFind;
  }
});

test('landlord rental request limit must be a positive integer', async () => {
  const originalFind = RentRequest.find;
  RentRequest.find = () => {
    throw new Error('Requests must not be loaded for an invalid limit');
  };
  const response = createResponse();

  try {
    await getLandlordRentalRequests({
      query: { limit: '0' },
      user: { id: '507f1f77bcf86cd799439012' },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'Limit must be a positive integer');
  } finally {
    RentRequest.find = originalFind;
  }
});
