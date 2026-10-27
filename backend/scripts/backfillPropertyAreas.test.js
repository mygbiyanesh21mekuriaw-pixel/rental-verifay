const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const { UNASSIGNED_AREA } = require('../utils/propertyArea');
const { backfillPropertyArea, buildMissingAreaFilter } = require('./backfillPropertyAreas');

test('missing property area filter excludes properties that already have an area', () => {
  const filter = buildMissingAreaFilter();
  assert.deepEqual(filter.$or[0], { area: { $exists: false } });
  assert.deepEqual(filter.$or[1], { area: null });
  assert.equal(filter.$or[2].area.test('  '), true);
});

test('area migration dry run derives an area without writing', async () => {
  const originalUpdateOne = Property.updateOne;
  Property.updateOne = () => assert.fail('Dry run must not write');
  const areas = [{ name: 'Dessie', addressMapping: { region: 'Amhara', city: 'Dessie' } }];

  try {
    assert.equal(await backfillPropertyArea({
      _id: 'property-id',
      region: 'Amhara',
      city: 'Dessie',
    }, areas, false), 'Dessie');
    assert.equal(await backfillPropertyArea({
      _id: 'unmapped-property',
      region: 'Oromia',
      city: 'Adama',
    }, areas, false), UNASSIGNED_AREA);
  } finally {
    Property.updateOne = originalUpdateOne;
  }
});

test('area migration writes derived assignments only when the property area is still missing', async () => {
  const originalUpdateOne = Property.updateOne;
  let update;
  Property.updateOne = async (filter, values) => {
    update = { filter, values };
    return { modifiedCount: 1 };
  };

  try {
    assert.equal(await backfillPropertyArea({
      _id: 'property-id',
      region: 'Amhara',
      city: 'Dessie',
    }, [{ name: 'Dessie', addressMapping: { region: 'Amhara', city: 'Dessie' } }], true), 'Dessie');
    assert.deepEqual(update.values, { $set: { area: 'Dessie', areaKey: 'dessie' } });
    assert.deepEqual(update.filter.$or, buildMissingAreaFilter().$or);
  } finally {
    Property.updateOne = originalUpdateOne;
  }
});

test('area migration can mark unmapped existing properties unassigned', async () => {
  const originalUpdateOne = Property.updateOne;
  let update;
  Property.updateOne = async (filter, values) => {
    update = { filter, values };
    return { modifiedCount: 1 };
  };

  try {
    assert.equal(await backfillPropertyArea({ _id: 'unmapped-property', city: 'Adama' }, [], true), UNASSIGNED_AREA);
    assert.deepEqual(update.values, { $set: { area: UNASSIGNED_AREA, areaKey: 'unassignedarea' } });
  } finally {
    Property.updateOne = originalUpdateOne;
  }
});
