require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const SystemLog = require('../models/SystemLog');
const User = require('../models/User');
const { UNKNOWN_HANDLER_NAME } = require('../utils/adminHandlingHistory');

const BATCH_SIZE = 200;
const isExecute = process.argv.includes('--execute');
const itemConfigs = [
  {
    Model: Property,
    logField: 'property',
    stateField: 'verificationStatus',
    states: ['approved', 'pending', 'rejected'],
    logActions: ['PROPERTY_VERIFIED', 'PROPERTY_REJECTED'],
    mapAction: (action) => (action === 'PROPERTY_VERIFIED' ? 'verified' : 'rejected'),
  },
  {
    Model: RentalRequest,
    logField: 'rentalRequest',
    stateField: 'status',
    states: ['approved', 'confirmed', 'expired', 'pending', 'rejected'],
    logActions: ['RENTAL_REQUEST_APPROVED', 'RENTAL_REQUEST_REJECTED'],
    mapAction: (action) => (action === 'RENTAL_REQUEST_APPROVED' ? 'verified' : 'rejected'),
  },
];

const hasHistory = (record) => Array.isArray(record.history) && record.history.length > 0;

const buildHistoryEntry = (log, mapAction, actorNames) => {
  const byId = log.user || null;
  return {
    action: mapAction(log.action),
    byId,
    byName: actorNames.get(String(byId)) || UNKNOWN_HANDLER_NAME,
    at: log.createdAt || new Date(),
    note: log.description || '',
  };
};

const processBatch = async ({ config, records }) => {
  if (records.length === 0) return 0;
  const ids = records.map((record) => record._id);
  const logs = await SystemLog.find({
    [config.logField]: { $in: ids },
    action: { $in: config.logActions },
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const actorIds = [...new Set(logs
    .map((log) => String(log.user || ''))
    .filter((id) => mongoose.isValidObjectId(id)))];
  const actors = actorIds.length
    ? await User.find({ _id: { $in: actorIds } }).select('_id name').lean()
    : [];
  const actorNames = new Map(actors.map((actor) => [String(actor._id), actor.name]));
  const logsByItem = new Map();
  logs.forEach((log) => {
    const itemId = String(log[config.logField]);
    const entries = logsByItem.get(itemId) || [];
    entries.push(buildHistoryEntry(log, config.mapAction, actorNames));
    logsByItem.set(itemId, entries);
  });

  let migrated = 0;
  for (const record of records) {
    if (hasHistory(record)) continue;
    const history = logsByItem.get(String(record._id)) || [];
    if (history.length === 0) {
      if (!['approved', 'rejected'].includes(record[config.stateField])) continue;
      const fallbackDecision = record[config.stateField] === 'approved' ? 'verified' : 'rejected';
      history.push({
        action: fallbackDecision,
        byId: null,
        byName: UNKNOWN_HANDLER_NAME,
        at: record.updatedAt || record.createdAt || new Date(),
        note: '',
      });
    }
    const latest = history[history.length - 1];
    const values = {
      handledBy: latest.byId || null,
      handledByName: latest.byName,
      handledByRole: 'area_admin',
      handledAt: latest.at,
      decision: latest.action,
      history,
    };

    if (isExecute) {
      const result = await config.Model.updateOne(
        {
          _id: record._id,
          $or: [
            { history: { $exists: false } },
            { history: { $size: 0 } },
            { history: null },
          ],
        },
        { $set: values },
      );
      if (result.modifiedCount > 0) migrated += 1;
    } else {
      migrated += 1;
    }
  }
  return migrated;
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to run this migration.');
  }
  await mongoose.connect(process.env.MONGO_URI);
  let total = 0;

  for (const config of itemConfigs) {
    const cursor = config.Model.find({
      [config.stateField]: { $in: config.states },
      $or: [
        { history: { $exists: false } },
        { history: { $size: 0 } },
        { history: null },
      ],
    })
      .select(`_id ${config.stateField} history createdAt updatedAt`)
      .sort({ _id: 1 })
      .cursor({ batchSize: BATCH_SIZE });
    let batch = [];
    for await (const record of cursor) {
      batch.push(record);
      if (batch.length === BATCH_SIZE) {
        total += await processBatch({ config, records: batch });
        batch = [];
      }
    }
    total += await processBatch({ config, records: batch });
  }

  console.log(`${isExecute ? 'Backfilled' : 'Dry run: would backfill'} ${total} records.`);
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('Admin handling history migration failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = { buildHistoryEntry, hasHistory };
