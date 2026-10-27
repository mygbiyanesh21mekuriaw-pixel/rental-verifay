require('dotenv').config();
const mongoose = require('mongoose');
const Area = require('../models/Area');
const ContactMessage = require('../models/ContactMessage');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const User = require('../models/User');
const { canonicalAreaKey } = require('../utils/canonicalArea');

const BATCH_SIZE = 200;
const isExecute = process.argv.includes('--execute');
const isMissing = (field) => ({
  $or: [
    { [field]: { $exists: false } },
    { [field]: null },
    { [field]: '' },
  ],
});

const backfillKey = async (Model, filter, keyField, valueField, execute = isExecute) => {
  let updated = 0;
  const cursor = Model.find(filter).select(`_id ${valueField} ${keyField}`).cursor({ batchSize: BATCH_SIZE });
  for await (const document of cursor) {
    const key = canonicalAreaKey(document[valueField]);
    if (!key) continue;
    updated += 1;
    if (execute) {
      await Model.updateOne(
        { _id: document._id, ...isMissing(keyField) },
        { $set: { [keyField]: key } },
      );
    }
  }
  return updated;
};

const backfillLegacyRentalRequestAreas = async (areas, execute = isExecute) => {
  let updated = 0;
  let unresolved = 0;
  const byKey = new Map();
  areas.forEach((area) => {
    const key = canonicalAreaKey(area.canonicalKey || area.name);
    if (!key) return;
    const matches = byKey.get(key) || [];
    matches.push(area);
    byKey.set(key, matches);
  });

  const cursor = RentalRequest.collection.find({ area: { $type: 'string' } }, {
    projection: { _id: 1, property: 1, area: 1 },
    batchSize: BATCH_SIZE,
  });
  for await (const request of cursor) {
    const property = await Property.findById(request.property).select('area areaKey').lean();
    const areaKey = canonicalAreaKey(property?.areaKey || property?.area);
    const matches = byKey.get(areaKey) || [];
    if (!property || matches.length !== 1) {
      unresolved += 1;
      console.warn('Could not resolve legacy rental-request area from its property:', {
        requestId: String(request._id),
        propertyId: String(request.property),
        areaKey,
      });
      continue;
    }

    updated += 1;
    if (execute) {
      await RentalRequest.collection.updateOne(
        { _id: request._id, area: { $type: 'string' } },
        { $set: { area: matches[0]._id, areaKey } },
      );
    }
  }
  return { updated, unresolved };
};

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required to run this migration.');

  await mongoose.connect(process.env.MONGO_URI);
  const areas = await Area.find().select('_id name canonicalKey').lean();
  const [areaKeys, propertyKeys, userKeys, contactKeys] = await Promise.all([
    backfillKey(Area, isMissing('canonicalKey'), 'canonicalKey', 'name'),
    backfillKey(Property, isMissing('areaKey'), 'areaKey', 'area'),
    backfillKey(User, {
      assignedArea: { $nin: ['', null] },
      ...isMissing('assignedAreaKey'),
    }, 'assignedAreaKey', 'assignedArea'),
    backfillKey(ContactMessage, isMissing('areaKey'), 'areaKey', 'area'),
  ]);
  const rentalAreas = await backfillLegacyRentalRequestAreas(areas);
  const mode = isExecute ? 'Backfilled' : 'Dry run: would backfill';
  console.log(
    `${mode} canonical keys (areas ${areaKeys}, properties ${propertyKeys}, `
    + `admins ${userKeys}, contact messages ${contactKeys}) and rental-request area references `
    + `(${rentalAreas.updated}; ${rentalAreas.unresolved} unresolved).`,
  );
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('Rental request area migration failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = { backfillKey, backfillLegacyRentalRequestAreas, isMissing };
