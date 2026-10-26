require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const UserPermission = require('../models/UserPermission');
const { getPermissionKeys, permissionRoleForUser } = require('../config/permissionCatalog');

const isExecute = process.argv.includes('--execute');

const migrateAccountStatusAndUserPermissions = async ({
  UserModel = User,
  UserPermissionModel = UserPermission,
  execute = isExecute,
} = {}) => {
  const users = await UserModel.find({})
    .select('_id role adminType adminAreas status')
    .lean();
  let statusesActivated = 0;
  let permissionRowsAdded = 0;

  for (const user of users) {
    const needsStatusBackfill = !['pending', 'active', 'suspended'].includes(user.status);
    if (needsStatusBackfill) statusesActivated += 1;
    const role = permissionRoleForUser(user);
    const keys = getPermissionKeys(role);
    permissionRowsAdded += keys.length;
    if (!execute) continue;

    if (needsStatusBackfill) {
      await UserModel.updateOne(
        { _id: user._id, status: { $nin: ['pending', 'active', 'suspended'] } },
        { $set: { status: 'active', isActive: true } },
      );
    }

    if (keys.length > 0) {
      await UserPermissionModel.bulkWrite(keys.map((permissionKey) => ({
        updateOne: {
          filter: { userId: user._id, permissionKey },
          update: {
            $setOnInsert: {
              userId: user._id,
              permissionKey,
              enabled: true,
              updatedAt: new Date(),
              updatedBy: null,
            },
          },
          upsert: true,
        },
      })), { ordered: false });
    }
  }

  return { users: users.length, statusesActivated, permissionRowsAdded };
};

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required to run this migration.');
  await mongoose.connect(process.env.MONGO_URI);
  if (isExecute) {
    await UserPermission.collection.createIndex(
      { userId: 1, permissionKey: 1 },
      { unique: true, name: 'unique_user_permission' },
    );
  }
  const result = await migrateAccountStatusAndUserPermissions();
  console.log(`${isExecute ? 'Migrated' : 'Dry run: would migrate'} ${result.users} users; `
    + `${result.statusesActivated} statuses to active; ${result.permissionRowsAdded} permission rows.`);
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('Account status/permission migration failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = { migrateAccountStatusAndUserPermissions };