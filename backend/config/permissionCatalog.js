const ALWAYS_ON = ['dashboard', 'accountSettings', 'changePassword'];

const PERMISSION_CATALOG = {
  platform_admin: [],
  area_admin: [
    'dashboard',
    'allProperties',
    'pendingProperties',
    'verifiedProperties',
    'rejectedProperties',
    'rentalRequests',
    'messages',
    'contactMessages',
    'users',
    'notifications',
    'accountSettings',
    'changePassword',
  ],
  landlord: [
    'dashboard',
    'addProperty',
    'myProperties',
    'verifiedProperties',
    'underReview',
    'rejectedProperties',
    'rentalRequests',
    'rentedProperties',
    'rentPayments',
    'bankInformation',
    'messages',
    'reviews',
    'notifications',
    'accountSettings',
    'changePassword',
  ],
  tenant: [
    'dashboard',
    'verifiedProperties',
    'favorites',
    'rentalRequests',
    'rentedProperty',
    'searchProperties',
    'recentlyViewed',
    'messages',
    'reviews',
    'notifications',
    'rentPayments',
    'accountSettings',
    'changePassword',
  ],
};

const PERMISSION_DEPENDENCIES = {
  area_admin: {
    pendingProperties: ['allProperties'],
    verifiedProperties: ['allProperties'],
    rejectedProperties: ['allProperties'],
  },
  landlord: {
    verifiedProperties: ['myProperties'],
    underReview: ['myProperties'],
    rejectedProperties: ['myProperties'],
    rentedProperties: ['myProperties'],
  },
  tenant: {},
};

const permissionRoleForUser = (user) => {
  if (user?.role === 'admin') {
    return user.adminType === 'area' || (!user.adminType && (user.adminAreas || []).length > 0)
      ? 'area_admin'
      : 'platform_admin';
  }
  return PERMISSION_CATALOG[user?.role] ? user.role : null;
};

const getPermissionKeys = (role) => {
  if (role !== 'platform_admin') return PERMISSION_CATALOG[role] || [];
  return [...new Set(Object.values(PERMISSION_CATALOG).flat().concat(ALWAYS_ON))];
};

const validatePermissionMap = (role, proposedPermissions, currentPermissions = {}) => {
  const keys = PERMISSION_CATALOG[role];
  if (!keys || role === 'platform_admin') return { error: 'Platform Admin permissions cannot be edited.' };
  if (!proposedPermissions || typeof proposedPermissions !== 'object' || Array.isArray(proposedPermissions)) {
    return { error: 'Permissions must be an object of permission keys and boolean values.' };
  }

  const unknownKeys = Object.keys(proposedPermissions).filter((key) => !keys.includes(key));
  if (unknownKeys.length > 0) return { error: `Unknown permission key(s): ${unknownKeys.join(', ')}.` };

  const invalidValues = Object.entries(proposedPermissions).filter(([, enabled]) => typeof enabled !== 'boolean');
  if (invalidValues.length > 0) return { error: 'Every permission value must be a boolean.' };

  const nextPermissions = Object.fromEntries(keys.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(currentPermissions, key) ? currentPermissions[key] === true : true,
  ]));
  Object.assign(nextPermissions, proposedPermissions);

  const lockedOff = ALWAYS_ON.find((key) => nextPermissions[key] === false);
  if (lockedOff) return { error: `${lockedOff} is always enabled and cannot be disabled.` };

  for (const [child, parents] of Object.entries(PERMISSION_DEPENDENCIES[role] || {})) {
    if (nextPermissions[child] === true) {
      const disabledParent = parents.find((parent) => nextPermissions[parent] !== true);
      if (disabledParent) return { error: `${child} requires ${disabledParent} to remain enabled.` };
    }
  }

  return { permissions: nextPermissions };
};

module.exports = {
  ALWAYS_ON,
  PERMISSION_CATALOG,
  PERMISSION_DEPENDENCIES,
  getPermissionKeys,
  permissionRoleForUser,
  validatePermissionMap,
};