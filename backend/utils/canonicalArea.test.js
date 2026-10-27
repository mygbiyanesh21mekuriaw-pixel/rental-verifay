const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalAreaKey,
  buildCanonicalAreaPattern,
  buildCanonicalAreaQuery,
} = require('./canonicalArea');

test('canonical area keys ignore case, whitespace, punctuation and accents', () => {
  const expected = canonicalAreaKey('Addis Ababa');
  for (const value of ['addisababa', 'addis ababa', '  ADDIS---ABABA ', 'Addís Abába']) {
    assert.equal(canonicalAreaKey(value), expected);
  }
});

test('canonical area queries match legacy name variations and canonical keys', () => {
  const query = buildCanonicalAreaQuery('Addis Ababa');
  assert.equal(query.$or[0].areaKey, 'addisababa');
  assert.equal(query.$or[1].area.test('addisababa'), true);
  assert.equal(query.$or[1].area.test('  ADDIS---ABABA '), true);
  assert.equal(buildCanonicalAreaPattern('  '), null);
});
