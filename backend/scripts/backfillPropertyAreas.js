require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../models/Property');
const Area = require('../models/Area');
const { matchAreaFromAddress, UNASSIGNED_AREA } = require('../utils/propertyArea');
const { canonicalAreaKey } = require('../utils/canonicalArea');

const BATCH_SIZE = 200;
const isExecute = process.argv.includes('--execute');

const buildMissingAreaFilter = () => ({
  $or: [
    { area: { $exists: false } },
    { area: null },
    { area: /^\s*$/ },
  ],
});

const backfillPropertyArea = async (property, areas, execute = isExecute) => {
  const area = matchAreaFromAddress(property, areas) || UNASSIGNED_AREA;
  if (!execute) return area;
  const result = await Property.updateOne(
    { _id: property._id, ...buildMissingAreaFilter() },
    { $set: { area, areaKey: canonicalAreaKey(area) } },
  );
  return result.modifiedCount > 0 ? area : null;
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to run this migration.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  let backfilled = 0;
  let assigned = 0;
  let unassigned = 0;
  const areas = await Area.find().select('name addressMapping').lean();
  const cursor = Property.find(buildMissingAreaFilter())
    .select('_id area region zone wereda city')
    .sort({ _id: 1 })
    .cursor({ batchSize: BATCH_SIZE });

  for await (const property of cursor) {
    const areaName = await backfillPropertyArea(property, areas);
    if (areaName) {
      backfilled += 1;
      if (areaName === UNASSIGNED_AREA) unassigned += 1;
      else assigned += 1;
    }
  }

  console.log(
    `${isExecute ? 'Backfilled' : 'Dry run: would backfill'} ${backfilled} properties `
    + `(${assigned} mapped, ${unassigned} unassigned).`,
  );
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('Property area migration failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = { buildMissingAreaFilter, backfillPropertyArea };
