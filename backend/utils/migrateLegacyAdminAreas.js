const Area = require('../models/Area');
const User = require('../models/User');
const Property = require('../models/Property');
const { normalizeAdminAreaObject } = require('./adminArea');
const { canonicalAreaKey } = require('./canonicalArea');

const formatAreaName = (value) => String(value || '').trim()
  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const getAreaName = (area) => {
  const normalized = normalizeAdminAreaObject(area);
  const name = normalized ? Object.values(normalized)[0] : '';
  return formatAreaName(name);
};

const migrateLegacyAdminAreas = async () => {
  const admins = await User.find({
    role: 'admin',
    $or: [
      { adminType: 'area' },
      { 'adminAreas.0': { $exists: true } },
      { assignedArea: { $exists: true, $nin: ['', null] } },
    ],
  }).select('_id adminAreas assignedArea').lean();

  for (const admin of admins) {
    const legacyNames = (admin.adminAreas || []).map(getAreaName).filter(Boolean);
    const requestedArea = formatAreaName(admin.assignedArea) || legacyNames[0] || '';
    const areaNames = [...new Set([requestedArea, ...legacyNames].filter(Boolean))];

    for (const name of areaNames) {
      const normalizedName = name.toLowerCase();
      try {
        await Area.updateOne(
          { normalizedName },
          { $set: { name, normalizedName } },
          { upsert: true },
        );
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }

    const canonicalArea = requestedArea
      ? await Area.findOne({ normalizedName: requestedArea.toLowerCase() }).select('name').lean()
      : null;
    await User.updateOne(
      { _id: admin._id },
      {
        $set: {
          adminType: 'area',
          assignedArea: canonicalArea?.name || requestedArea,
          assignedAreaKey: canonicalAreaKey(canonicalArea?.name || requestedArea),
          adminAreas: canonicalArea ? [{ city: canonicalArea.name }] : [],
        },
      },
    );
  }

  const areas = await Area.find().select('name').lean();
  for (const area of areas) {
    const escapedName = area.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactMatch = new RegExp(`^${escapedName}$`, 'i');
    await Property.updateMany(
      {
        $and: [
          { area: { $in: ['', null] } },
          {
            $or: ['region', 'zone', 'wereda', 'city', 'subCity'].map((field) => ({
              [field]: exactMatch,
            })),
          },
        ],
      },
      {
        $set: {
          area: area.name,
          areaKey: canonicalAreaKey(area.name),
        },
      },
    );
  }
};

module.exports = migrateLegacyAdminAreas;
