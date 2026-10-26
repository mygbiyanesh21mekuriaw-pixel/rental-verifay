const mongoose = require('mongoose');
const UserPermission = require('../models/UserPermission');
const { ALWAYS_ON, getPermissionKeys } = require('../config/permissionCatalog');

const getDefaultUserPermissions = (role) => Object.fromEntries(
  getPermissionKeys(role).map((permissionKey) => [permissionKey, true]),
);

const mergeUserPermissions = (role, rows = []) => {
  const permissions = getDefaultUserPermissions(role);
  if (role !== 'platform_admin') {
    rows.forEach(({ permissionKey, enabled }) => {
      if (Object.prototype.hasOwnProperty.call(permissions, permissionKey)) {
        permissions[permissionKey] = enabled === true;
      }
    });
  }
  ALWAYS_ON.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(permissions, key)) permissions[key] = true;
  });
  return permissions;
};

const getUserPermissions = async (userId, role) => {
  if (role === 'platform_admin' || !userId || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return getDefaultUserPermissions(role);
  }

  const rows = await UserPermission.find({ userId }).select('permissionKey enabled').lean();
  return mergeUserPermissions(role, rows);
};

const ensureUserPermissions = async (userId, role, updatedBy = null) => {
  const permissionKeys = getPermissionKeys(role);
  if (
    !mongoose.isValidObjectId(userId) ||
    permissionKeys.length === 0 ||
    mongoose.connection.readyState !== 1 ||
    !mongoose.connection.db
  ) return;
  await UserPermission.bulkWrite(permissionKeys.map((permissionKey) => ({
    updateOne: {
      filter: { userId, permissionKey },
      update: {
        $setOnInsert: {
          userId,
          permissionKey,
          enabled: true,
          updatedAt: new Date(),
          updatedBy,
        },
      },
      upsert: true,
    },
  })), { ordered: false });
};

const replaceUserPermissions = async (userId, role, permissions, updatedBy, replaceAll = false) => {
  const keys = getPermissionKeys(role);
  if (!mongoose.isValidObjectId(userId)) throw new Error('Invalid user ID for permission update.');
  if (replaceAll) {
    await UserPermission.deleteMany({ userId });
    if (keys.length === 0) return;
    await UserPermission.insertMany(keys.map((permissionKey) => ({
      userId,
      permissionKey,
      enabled: permissions[permissionKey] === true,
      updatedBy,
      updatedAt: new Date(),
    })), { ordered: true });
    return;
  }
  if (keys.length > 0) {
    await UserPermission.bulkWrite(keys.map((permissionKey) => ({
      updateOne: {
        filter: { userId, permissionKey },
        update: {
          $set: {
            enabled: permissions[permissionKey] === true,
            updatedBy,
            updatedAt: new Date(),
          },
          $setOnInsert: { userId, permissionKey },
        },
        upsert: true,
      },
    })), { ordered: false });
  }
  await UserPermission.deleteMany({ userId, permissionKey: { $nin: keys } });
};

module.exports = {
  getDefaultUserPermissions,
  mergeUserPermissions,
  getUserPermissions,
  ensureUserPermissions,
  replaceUserPermissions,
};