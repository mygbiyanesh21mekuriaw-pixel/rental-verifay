const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const { createPayment, getTenantPaymentContext } = require('./paymentController');

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

test('non-tenant cannot initialize a payment or read tenant payment context', async () => {
  const originalFindById = Property.findById;
  const originalFindOne = Property.findOne;
  Property.findById = () => {
    throw new Error('Property must not be queried for a non-tenant');
  };
  Property.findOne = () => {
    throw new Error('Payment context must not be queried for a non-tenant');
  };

  try {
    const createResponseValue = createResponse();
    await createPayment({
      user: { id: '507f1f77bcf86cd799439011', role: 'landlord' },
      body: { propertyId: '507f1f77bcf86cd799439012', paymentPeriod: '2026-10' },
    }, createResponseValue);
    assert.equal(createResponseValue.statusCode, 403);
    assert.match(createResponseValue.body.message, /Only tenants can pay rent/);

    const contextResponse = createResponse();
    await getTenantPaymentContext({
      user: { id: '507f1f77bcf86cd799439013', role: 'admin' },
      params: { propertyId: '507f1f77bcf86cd799439012' },
    }, contextResponse);
    assert.equal(contextResponse.statusCode, 403);
    assert.match(contextResponse.body.message, /Only tenants can view/);
  } finally {
    Property.findById = originalFindById;
    Property.findOne = originalFindOne;
  }
});
