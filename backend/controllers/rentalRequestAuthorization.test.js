const test = require('node:test');
const assert = require('node:assert/strict');
const RentRequest = require('../models/RentalRequest');
const { landlordRespondToRequest } = require('./rentalRequestController');

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
