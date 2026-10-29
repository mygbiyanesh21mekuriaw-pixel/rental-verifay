const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const Payment = require('../models/Payment');
const RentalRequest = require('../models/RentalRequest');
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

test('duplicate paid or pending rental periods are rejected with 409', async () => {
  const originals = {
    propertyFindById: Property.findById,
    rentalFindOne: RentalRequest.findOne,
    paymentFindOne: Payment.findOne,
    paymentFindById: Payment.findById,
  };
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const propertyId = '507f1f77bcf86cd799439012';
  const tenantId = '507f1f77bcf86cd799439011';
  const rental = {
    _id: '507f1f77bcf86cd799439013',
    property: propertyId,
    tenant: tenantId,
    landlord: '507f1f77bcf86cd799439014',
    status: 'confirmed',
    moveInDate: new Date(`${period}-01T00:00:00`),
  };
  const property = {
    _id: propertyId,
    landlord: rental.landlord,
    rentedBy: tenantId,
    availabilityStatus: 'rented',
    price: 2500,
  };

  Property.findById = async () => property;
  RentalRequest.findOne = async () => rental;
  Payment.findById = (id) => {
    const duplicate = duplicatePayments.find((payment) => String(payment._id) === String(id));
    const query = {
      populate() { return this; },
      then(resolve, reject) { return Promise.resolve(duplicate).then(resolve, reject); },
    };
    return query;
  };

  const duplicatePayments = [
    { _id: 'pending-payment', rentalRequest: rental._id, paymentPeriod: period, status: 'pending' },
    {
      _id: 'paid-payment',
      rentalRequest: rental._id,
      paymentPeriod: period,
      paymentReference: 'RP-paid',
      providerReference: 'RP-paid',
      providerTransactionReference: 'CHAPA-paid',
      provider: 'chapa',
      verifiedAt: new Date(),
      status: 'paid',
    },
  ];

  try {
    for (const duplicate of duplicatePayments) {
      Payment.findOne = async () => duplicate;
      const response = createResponse();
      await createPayment({
        user: { id: tenantId, role: 'tenant' },
        body: { propertyId, rentalId: rental._id, paymentPeriod: period },
      }, response);
      assert.equal(response.statusCode, 409);
      assert.match(response.body.message, /already pending|already been paid/);
    }
  } finally {
    Property.findById = originals.propertyFindById;
    RentalRequest.findOne = originals.rentalFindOne;
    Payment.findOne = originals.paymentFindOne;
    Payment.findById = originals.paymentFindById;
  }
});

test('verified rental-period payments have a unique rental and period index', () => {
  const [keys, options] = Payment.schema.indexes().find(([indexKeys]) => (
    indexKeys.rentalRequest === 1 && indexKeys.paymentPeriod === 1
  ));
  assert.deepEqual(keys, { rentalRequest: 1, paymentPeriod: 1 });
  assert.equal(options.unique, true);
  assert.equal(options.partialFilterExpression.status, 'paid');
});
