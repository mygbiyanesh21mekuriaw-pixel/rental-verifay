const test = require('node:test');
const assert = require('node:assert/strict');
const { matchAreaFromAddress, UNASSIGNED_AREA } = require('./propertyArea');

const areas = [
  { name: 'Addis Ababa', addressMapping: { region: 'Addis Ababa' } },
  { name: 'Bahirdar', addressMapping: { region: 'Amhara', city: 'Bahirdar' } },
  { name: 'Dessie', addressMapping: { region: 'Amhara', zone: 'South Wollo', city: 'Dessie' } },
];

test('maps addresses from Region, Zone, Wereda, and City values', () => {
  assert.equal(matchAreaFromAddress({ region: 'Addis Ababa' }, areas), 'Addis Ababa');
  assert.equal(matchAreaFromAddress({ region: 'Amhara', city: 'Bahirdar' }, areas), 'Bahirdar');
  assert.equal(matchAreaFromAddress({ region: 'Amhara', zone: 'South Wollo', city: 'Dessie' }, areas), 'Dessie');
});

test('returns no match for unmapped or ambiguous addresses', () => {
  assert.equal(matchAreaFromAddress({ region: 'Oromia', city: 'Adama' }, areas), null);
  assert.equal(matchAreaFromAddress({ region: 'Amhara' }, [
    { name: 'North', addressMapping: { region: 'Amhara' } },
    { name: 'South', addressMapping: { region: 'Amhara' } },
  ]), null);
});

test('defines an explicit unassigned-area value for properties without a match', () => {
  assert.equal(UNASSIGNED_AREA, 'Unassigned area');
});