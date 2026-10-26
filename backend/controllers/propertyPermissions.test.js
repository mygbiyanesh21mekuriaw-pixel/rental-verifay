const test = require('node:test');
const assert = require('node:assert/strict');
const { filterLandlordPropertiesByPermissions } = require('./propertyController');

test('landlord property API omits records for disabled status features', () => {
  const properties = [
    { _id: 'approved', verificationStatus: 'approved', availabilityStatus: 'available' },
    { _id: 'pending', verificationStatus: 'pending', availabilityStatus: 'available' },
    { _id: 'rejected', verificationStatus: 'rejected', availabilityStatus: 'available' },
    { _id: 'rented', verificationStatus: 'approved', availabilityStatus: 'rented' },
  ];

  const filtered = filterLandlordPropertiesByPermissions(properties, { verifiedProperties: true });
  assert.deepEqual(filtered.map((property) => property._id), ['approved']);
});