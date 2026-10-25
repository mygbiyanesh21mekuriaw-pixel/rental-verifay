const User = require('../models/User');
const { getAdministrativeRole } = require('../middleware/auth');
const { getAdminAreaNames } = require('./areaAdminHandover');

const normalizeAreaName = (areaName) => String(areaName || '').trim().toLocaleLowerCase('en');

const getAreaAdminConflict = async (areaName, excludeAdminId = null) => {
  const normalizedAreaName = normalizeAreaName(areaName);
  if (!normalizedAreaName) return null;

  const admins = await User.find({ role: 'admin' })
    .select('_id name role adminType assignedArea adminAreas')
    .lean();
  return admins.find((admin) => {
    if (excludeAdminId && String(admin._id) === String(excludeAdminId)) return false;
    if (getAdministrativeRole(admin) !== 'area_admin') return false;
    return getAdminAreaNames(admin).some((area) => normalizeAreaName(area) === normalizedAreaName);
  }) || null;
};

const getAreaAdminConflictMessage = (areaName, adminName) => (
  `Area ${areaName} already has an Area Admin (${adminName || 'Unknown'}). Demote or reassign that admin first.`
);

const isAreaAdminDuplicateKeyError = (error) => error?.code === 11000 && (
  error.keyPattern?.assignedArea
  || error.keyValue?.assignedArea
  || String(error.message || '').includes('one_area_admin_per_area')
);

const getSingleAreaAdminConflicts = async () => {
  const admins = await User.find({ role: 'admin' })
    .select('_id name role adminType assignedArea adminAreas isActive')
    .lean();
  const byArea = new Map();
  admins.forEach((admin) => {
    if (getAdministrativeRole(admin) !== 'area_admin') return;
    const areas = getAdminAreaNames(admin);
    areas.forEach((areaName) => {
      const key = normalizeAreaName(areaName);
      if (!key) return;
      const entries = byArea.get(key) || [];
      if (!entries.some((entry) => String(entry._id) === String(admin._id))) {
        entries.push({
          _id: String(admin._id),
          name: admin.name || 'Unknown',
          area: areaName,
          isActive: admin.isActive !== false,
        });
      }
      byArea.set(key, entries);
    });
  });
  return [...byArea.values()].filter((entries) => entries.length > 1);
};

const ensureSingleAreaAdminIndex = async () => {
  try {
    await User.collection.createIndex(
      { username: 1 },
      { name: 'username_1', unique: true, sparse: true },
    );
    const conflicts = await getSingleAreaAdminConflicts();
    if (conflicts.length > 0) {
      console.error('Cannot create one_area_admin_per_area index: existing Area Admin conflicts were found.');
      conflicts.forEach((admins) => {
        console.error(`Area ${admins[0].area}: ${admins.map((admin) => `${admin.name} (${admin._id})${admin.isActive ? '' : ' [inactive]'}`).join(', ')}`);
      });
      console.error('Resolve each conflict manually by reassigning an area or demoting an admin. Deactivation alone does not free the area reservation. Then restart the backend.');
      return false;
    }

    await User.collection.createIndex(
      { assignedArea: 1 },
      {
        name: 'one_area_admin_per_area',
        unique: true,
        partialFilterExpression: {
          role: 'admin',
          adminType: 'area',
          assignedArea: { $type: 'string', $gt: '' },
        },
        collation: { locale: 'en', strength: 2 },
      },
    );
    console.log('✅ One-Area-Admin-per-area unique index is ready.');
    return true;
  } catch (error) {
    if (error?.code === 11000) {
      console.error('Cannot create one_area_admin_per_area index because existing Area Admin assignments conflict.');
    } else {
      console.error('Unable to create one_area_admin_per_area index:', error.message);
    }
    console.error('Run `node scripts/reportAreaAdminConflicts.js`, resolve conflicts manually by reassigning an area or demoting an admin, then restart the backend. Deactivation alone does not free the area reservation.');
    return false;
  }
};

module.exports = {
  ensureSingleAreaAdminIndex,
  getAreaAdminConflict,
  getAreaAdminConflictMessage,
  getSingleAreaAdminConflicts,
  isAreaAdminDuplicateKeyError,
  normalizeAreaName,
};
