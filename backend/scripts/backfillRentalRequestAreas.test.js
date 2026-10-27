const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const { backfillLegacyRentalRequestAreas } = require('./backfillRentalRequestAreas');

const withLegacyRequest = async (request, property, callback) => {
  const originalFind = RentalRequest.collection.find;
  const originalUpdateOne = RentalRequest.collection.updateOne;
  const originalFindById = Property.findById;
  let update;
  RentalRequest.collection.find = (filter) => {
    assert.deepEqual(filter, { area: { $type: 'string' } });
    return {
      async *[Symbol.asyncIterator]() {
        yield request;
      },
    };
  };
  RentalRequest.collection.updateOne = async (filter, values) => {
    update = { filter, values };
    return { modifiedCount: 1 };
  };
  Property.findById = () => ({
    select() {
      return { lean: async () => property };
    },
  });
  try {
    await callback(() => update);
  } finally {
    RentalRequest.collection.find = originalFind;
    RentalRequest.collection.updateOne = originalUpdateOne;
    Property.findById = originalFindById;
  }
};

test('legacy rental-request area dry run resolves using the linked property without writing', async () => {
  await withLegacyRequest(
    { _id: 'request-id', property: 'property-id', area: 'addisababa' },
    { area: 'Addis Ababa' },
    async (getUpdate) => {
      const result = await backfillLegacyRentalRequestAreas([
        { _id: 'area-id', name: 'Addis Ababa' },
      ], false);
      assert.deepEqual(result, { updated: 1, unresolved: 0 });
      assert.equal(getUpdate(), undefined);
    },
  );
});

test('legacy rental-request area backfill writes an Area reference only over a string value', async () => {
  await withLegacyRequest(
    { _id: 'request-id', property: 'property-id', area: 'addis ababa' },
    { areaKey: 'addisababa', area: 'Addis Ababa' },
    async (getUpdate) => {
      await backfillLegacyRentalRequestAreas([
        { _id: 'area-id', name: 'Addis Ababa' },
      ], true);
      const update = getUpdate();
      assert.deepEqual(update.filter, {
        _id: 'request-id',
        area: { $type: 'string' },
      });
      assert.deepEqual(update.values, {
        $set: { area: 'area-id', areaKey: 'addisababa' },
      });
    },
  );
});

test('legacy rental-request area backfill leaves unresolved values unchanged', async () => {
  await withLegacyRequest(
    { _id: 'request-id', property: 'property-id', area: 'Old name' },
    { area: 'Unknown area' },
    async (getUpdate) => {
      const result = await backfillLegacyRentalRequestAreas([
        { _id: 'area-id', name: 'Addis Ababa' },
      ], true);
      assert.deepEqual(result, { updated: 0, unresolved: 1 });
      assert.equal(getUpdate(), undefined);
    },
  );
});
