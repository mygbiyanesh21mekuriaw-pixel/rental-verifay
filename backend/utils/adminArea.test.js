const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAssignedAreaQuery } = require('./area');
const { buildAdminAreaQuery, propertyMatchesAdminAreas } = require('./adminArea');

test('Area Admin queries scope only by the property area field', () => {
  const query = buildAssignedAreaQuery('Dessie');
  const adminAreaQuery = buildAdminAreaQuery([{ city: 'Dessie' }]);

  assert.equal(query.$or[0].areaKey, 'dessie');
  assert.equal(query.$or[1].area.test('Dessie'), true);
  assert.equal(query.city, undefined);
  assert.equal(adminAreaQuery.$or.length, 2);
  assert.equal(adminAreaQuery.$or[0].areaKey, 'dessie');
  assert.equal(adminAreaQuery.$or[1].area.test('Dessie'), true);
  assert.equal(adminAreaQuery.$or[0].city, undefined);
});

test('Area Admin property matching does not infer area from property address fields', () => {
  const assignedArea = [{ city: 'Dessie' }];

  assert.equal(propertyMatchesAdminAreas({ area: 'Dessie', city: 'Bole' }, assignedArea), true);
  assert.equal(propertyMatchesAdminAreas({ area: 'North', city: 'Dessie' }, assignedArea), false);
  assert.equal(propertyMatchesAdminAreas({ city: 'Dessie' }, assignedArea), false);
});

test('only the Area Admin assigned to the derived property area can see it', () => {
  const derivedProperty = { area: 'Bahirdar', city: 'Bahir Dar' };

  assert.equal(propertyMatchesAdminAreas(derivedProperty, [{ city: 'Bahirdar' }]), true);
  assert.equal(propertyMatchesAdminAreas({ area: 'Addis Ababa' }, [{ city: 'addisababa' }]), true);
  assert.equal(propertyMatchesAdminAreas(derivedProperty, [{ city: 'Dessie' }]), false);
});
