const test = require('node:test');
const assert = require('node:assert/strict');
const Payment = require('../models/Payment');
const Property = require('../models/Property');
const User = require('../models/User');
const { getAdminPaymentPeriods } = require('../controllers/adminController');
const { platformAdminOnly } = require('../middleware/auth');

const createResponse = () => ({
  statusCode: 200,
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

const createQuery = (result, onCall = () => {}) => {
  const query = {
    select(value) {
      onCall('select', value);
      return this;
    },
    populate(...values) {
      onCall('populate', values);
      return this;
    },
    sort(value) {
      onCall('sort', value);
      return this;
    },
    skip(value) {
      onCall('skip', value);
      return this;
    },
    limit(value) {
      onCall('limit', value);
      return this;
    },
    lean() {
      return Promise.resolve(result);
    },
  };
  return query;
};

const withModelStubs = async (stubs, callback) => {
  const originals = stubs.map(([model, methods]) => [
    model,
    Object.fromEntries(Object.keys(methods).map((method) => [method, model[method]])),
  ]);
  stubs.forEach(([model, methods]) => Object.assign(model, methods));
  try {
    await callback();
  } finally {
    originals.forEach(([model, methods]) => Object.assign(model, methods));
  }
};

test('filters payment periods and returns filtered totals with server pagination', async () => {
  const propertyQueries = [];
  const paymentQueries = [];
  const paymentOptions = [];
  let aggregatePipeline;
  const totals = {
    totalPayments: 31,
    totalCollected: 12500,
    paidCount: 19,
    pendingFailedCount: 8,
  };
  const payment = {
    _id: 'payment-id',
    tenant: { name: 'Test Tenant', email: 'private@example.com' },
    property: { title: 'Test Home', area: 'north district', city: 'North City' },
    paymentPeriod: '2026-03',
    amount: 12500,
    currency: 'ETB',
    status: 'paid',
    paymentReference: 'ref.*-123',
    verifiedAt: new Date('2026-03-15T10:00:00.000Z'),
    providerReference: 'provider-secret',
    checkoutUrl: 'https://private.example',
  };

  await withModelStubs([
    [Property, {
      find: (query) => {
        propertyQueries.push(query);
        const result = propertyQueries.length === 1
          ? [{ _id: 'area-property' }]
          : [{ _id: 'matching-property' }];
        return createQuery(result);
      },
    }],
    [User, {
      find: (query) => {
        assert.equal(query.role, 'tenant');
        assert.ok(query.name.test('ref.*'));
        return createQuery([{ _id: 'matching-tenant' }]);
      },
    }],
    [Payment, {
      find: (query) => {
        paymentQueries.push(query);
        return createQuery([payment], (method, value) => paymentOptions.push([method, value]));
      },
      aggregate: (pipeline) => {
        aggregatePipeline = pipeline;
        return Promise.resolve([totals]);
      },
    }],
  ], async () => {
    const response = createResponse();
    await getAdminPaymentPeriods({
      query: {
        page: '2',
        limit: '25',
        q: 'ref.*',
        period: '2026-03',
        area: 'North',
        status: 'paid',
        from: '2026-03-01',
        to: '2026-03-31',
        sort: 'amount:asc',
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.totals.totalPayments, 31);
    assert.equal(response.body.totals.totalCollected, 12500);
    assert.equal(response.body.totals.paidCount, 19);
    assert.equal(response.body.totals.pendingFailedCount, 8);
    assert.deepEqual(response.body.pagination, { page: 2, limit: 25, total: 31, pages: 2 });
    assert.equal(response.body.payments.length, 1);
    assert.equal(response.body.payments[0].paidOn.toISOString(), payment.verifiedAt.toISOString());
    assert.equal(Object.prototype.hasOwnProperty.call(response.body.payments[0], 'providerReference'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(response.body.payments[0], 'checkoutUrl'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(response.body.payments[0].tenant, 'email'), false);

    assert.deepEqual(propertyQueries[0], { area: /North/i });
    assert.deepEqual(propertyQueries[1], { title: /ref\.\*/i });
    const filter = paymentQueries[0];
    assert.equal(filter.paymentPeriod, '2026-03');
    assert.equal(filter.status, 'paid');
    assert.deepEqual(filter.verifiedAt, {
      $gte: new Date('2026-03-01T00:00:00.000Z'),
      $lte: new Date('2026-03-31T23:59:59.999Z'),
    });
    assert.deepEqual(filter.$and[0], { property: { $in: ['area-property'] } });
    const searchConditions = filter.$and[1].$or;
    assert.equal(searchConditions[0].paymentReference.test('ref.*-123'), true);
    assert.equal(searchConditions[0].paymentReference.test('reference-123'), false);
    assert.deepEqual(searchConditions[1], { property: { $in: ['matching-property'] } });
    assert.deepEqual(searchConditions[2], { tenant: { $in: ['matching-tenant'] } });
    assert.deepEqual(aggregatePipeline[0], { $match: filter });
    assert.deepEqual(paymentOptions.find(([method]) => method === 'sort'), ['sort', { amount: 1, _id: 1 }]);
    assert.deepEqual(paymentOptions.find(([method]) => method === 'skip'), ['skip', 25]);
    assert.deepEqual(paymentOptions.find(([method]) => method === 'limit'), ['limit', 25]);
  });
});

test('returns zero totals and rejects invalid pagination or filters before querying payments', async () => {
  let paymentFindCalls = 0;
  await withModelStubs([
    [Payment, {
      find: () => {
        paymentFindCalls += 1;
        return createQuery([]);
      },
      aggregate: () => Promise.resolve([]),
    }],
  ], async () => {
    const emptyResponse = createResponse();
    await getAdminPaymentPeriods({ query: { page: '1', limit: '10' } }, emptyResponse);
    assert.deepEqual(emptyResponse.body.totals, {
      totalPayments: 0,
      totalCollected: 0,
      paidCount: 0,
      pendingFailedCount: 0,
    });
    assert.deepEqual(emptyResponse.body.pagination, { page: 1, limit: 10, total: 0, pages: 0 });

    const invalidResponse = createResponse();
    await getAdminPaymentPeriods({ query: { page: '0', limit: '15', status: 'unknown' } }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(paymentFindCalls, 1);
  });
});

test('payment periods require platform admin access and deny area admins, landlords, and tenants', () => {
  const allowedUser = { role: 'admin', adminType: 'platform' };
  const allowedResponse = createResponse();
  let nextCalled = false;
  platformAdminOnly({ user: allowedUser }, allowedResponse, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  for (const user of [
    { role: 'admin', adminType: 'area', assignedArea: 'North' },
    { role: 'area_admin', assignedArea: 'North' },
    { role: 'landlord' },
    { role: 'tenant' },
  ]) {
    const response = createResponse();
    let deniedNextCalled = false;
    platformAdminOnly({ user }, response, () => {
      deniedNextCalled = true;
    });
    assert.equal(response.statusCode, 403);
    assert.equal(deniedNextCalled, false);
  }
});
