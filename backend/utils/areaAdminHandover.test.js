const test = require('node:test');
const assert = require('node:assert/strict');
const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const RentalRequest = require('../models/RentalRequest');
const ContactMessage = require('../models/ContactMessage');
const Notification = require('../models/Notification');
const { clearUnfinishedAreaAdminAssignments } = require('./areaAdminHandover');

const queryMatchesArea = (value, areaName) => {
  if (value instanceof RegExp) return value.test(areaName);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((child) => queryMatchesArea(child, areaName));
};

const findAssignmentFilter = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.$or) && value.$or.some((condition) => condition.assignedTo || condition.ownerAdminId)) {
    return value;
  }
  return Object.values(value).map(findAssignmentFilter).find(Boolean) || null;
};

test('handover clears only the departing admin and their database-assigned area', async () => {
  const originals = {
    propertyFind: Property.find,
    propertyUpdate: Property.updateMany,
    verificationUpdate: VerificationRequest.updateMany,
    rentalUpdate: RentalRequest.updateMany,
    messageUpdate: ContactMessage.updateMany,
    notificationUpdate: Notification.updateMany,
  };
  const updateCalls = [];
  const properties = [
    { _id: 'bahirdar-property', area: 'Bahirdar' },
    { _id: 'dessie-property', area: 'Dessie' },
  ];
  const recordUpdate = (model) => async (filter, update, options) => {
    updateCalls.push({ model, filter, update, options });
  };
  Property.find = (filter) => ({
    select: () => ({
      lean: async () => properties.filter((property) => queryMatchesArea(filter, property.area)),
    }),
  });
  Property.updateMany = recordUpdate('Property');
  VerificationRequest.updateMany = recordUpdate('VerificationRequest');
  RentalRequest.updateMany = recordUpdate('RentalRequest');
  ContactMessage.updateMany = recordUpdate('ContactMessage');
  Notification.updateMany = recordUpdate('Notification');

  try {
    await clearUnfinishedAreaAdminAssignments({
      _id: 'departing-admin-id',
      assignedArea: 'Dessie',
      adminAreas: [{ city: 'Bahirdar' }],
    });

    assert.deepEqual(updateCalls.map(({ model }) => model).sort(), [
      'ContactMessage', 'Notification', 'Property', 'RentalRequest', 'VerificationRequest',
    ]);
    for (const { model, filter, update, options } of updateCalls) {
      assert.deepEqual(update, { $unset: { assignedTo: 1, ownerAdminId: 1 } }, model);
      assert.equal(options.strict, false);
      assert.deepEqual(findAssignmentFilter(filter).$or, [
        { assignedTo: { $in: ['departing-admin-id', 'departing-admin-id'] } },
        { ownerAdminId: { $in: ['departing-admin-id', 'departing-admin-id'] } },
      ]);
      assert.equal(JSON.stringify(update).includes('reviewedBy'), false);
      assert.equal(JSON.stringify(update).includes('area'), false);
    }

    const propertyUpdate = updateCalls.find((call) => call.model === 'Property');
    const verificationUpdate = updateCalls.find((call) => call.model === 'VerificationRequest');
    const rentalUpdate = updateCalls.find((call) => call.model === 'RentalRequest');
    const messageUpdate = updateCalls.find((call) => call.model === 'ContactMessage');
    assert.ok(queryMatchesArea(propertyUpdate.filter, 'Dessie'));
    assert.equal(queryMatchesArea(propertyUpdate.filter, 'Bahirdar'), false);
    assert.equal(propertyUpdate.filter.verificationStatus, 'pending');
    assert.equal(propertyUpdate.filter.isVerified, false);
    assert.equal(verificationUpdate.filter.status, 'pending');
    assert.equal(rentalUpdate.filter.status, 'pending');
    assert.equal(messageUpdate.filter.read, false);
    assert.deepEqual(rentalUpdate.filter.property, { $in: ['dessie-property'] });
    assert.deepEqual(verificationUpdate.filter.property, { $in: ['dessie-property'] });
    assert.deepEqual(messageUpdate.filter.area, { $in: ['Dessie'] });
  } finally {
    Property.find = originals.propertyFind;
    Property.updateMany = originals.propertyUpdate;
    VerificationRequest.updateMany = originals.verificationUpdate;
    RentalRequest.updateMany = originals.rentalUpdate;
    ContactMessage.updateMany = originals.messageUpdate;
    Notification.updateMany = originals.notificationUpdate;
  }
});