const test = require('node:test');
const assert = require('node:assert/strict');
const RentRequest = require('../models/RentalRequest');
const {
  getMyRentRequests,
  isRecentRental,
  NEW_RENTAL_DAYS,
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

test('new rental window is configurable and expires after seven days', () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  assert.equal(NEW_RENTAL_DAYS, 7);
  assert.equal(isRecentRental(new Date(now - 6 * day), now), true);
  assert.equal(isRecentRental(new Date(now - 8 * day), now), false);
  assert.equal(isRecentRental(new Date(now + day), now), false);
  assert.equal(isRecentRental('not-a-date', now), false);
});

test('tenant request response provides rental start date and server-calculated is_new', async () => {
  const originalFind = RentRequest.find;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const requests = [
    {
      _id: 'recent-rental',
      createdAt: new Date(now - 40 * day),
      property: { rentedAt: new Date(now - 2 * day) },
    },
    {
      _id: 'older-rental',
      createdAt: new Date(now - 9 * day),
      property: { rentedAt: new Date(now - 9 * day) },
    },
    {
      _id: 'legacy-rental',
      createdAt: new Date(now - 3 * day),
      property: { rentedAt: null },
    },
  ];
  let queryFilter;

  RentRequest.find = (filter) => {
    queryFilter = filter;
    return {
      populate() { return this; },
      sort() { return Promise.resolve(requests); },
    };
  };

  try {
    const response = createResponse();
    await getMyRentRequests({ user: { id: 'tenant-id' } }, response);

    assert.deepEqual(queryFilter, { tenant: 'tenant-id' });
    assert.equal(response.body[0].rentalCreatedAt, requests[0].property.rentedAt);
    assert.equal(response.body[0].is_new, true);
    assert.equal(
      new Date(response.body[0].is_new_until).getTime(),
      new Date(requests[0].property.rentedAt).getTime() + 7 * day,
    );
    assert.equal(response.body[1].rentalCreatedAt, requests[1].property.rentedAt);
    assert.equal(response.body[1].is_new, false);
    assert.equal(response.body[2].rentalCreatedAt, requests[2].createdAt);
    assert.equal(response.body[2].is_new, true);
    assert.equal(
      new Date(response.body[2].is_new_until).getTime(),
      new Date(requests[2].createdAt).getTime() + 7 * day,
    );
  } finally {
    RentRequest.find = originalFind;
  }
});
