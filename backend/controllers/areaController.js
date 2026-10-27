const mongoose = require('mongoose');
const Area = require('../models/Area');
const User = require('../models/User');
const Property = require('../models/Property');
const ContactMessage = require('../models/ContactMessage');
const RentalRequest = require('../models/RentalRequest');
const { buildAssignedAreaQuery } = require('../utils/area');
const { ADDRESS_MAPPING_FIELDS, matchAreaFromAddress, UNASSIGNED_AREA } = require('../utils/propertyArea');
const {
  canonicalAreaKey,
  buildCanonicalAreaPattern,
  buildCanonicalAreaQuery,
} = require('../utils/canonicalArea');
const { logAudit } = require('../utils/auditLogger');

const normalizePlaceFields = (body = {}) => {
  const addressMapping = Object.fromEntries(ADDRESS_MAPPING_FIELDS.map((field) => [
    field,
    typeof body.addressMapping?.[field] === 'string' ? body.addressMapping[field].trim() : '',
  ]));
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    region: typeof body.region === 'string' ? body.region.trim() : '',
    addressMapping,
  };
};

const validatePlaceFields = ({ name, region, addressMapping }, res) => {
  if (!name) {
    res.status(400).json({ message: 'Place name is required.' });
    return false;
  }
  if ([name, region, ...Object.values(addressMapping)].some((value) => value.length > 120)) {
    res.status(400).json({ message: 'Place name, region, and address mappings must be 120 characters or fewer.' });
    return false;
  }
  if (!Object.values(addressMapping).some(Boolean)) {
    res.status(400).json({ message: 'At least one address matching rule is required.' });
    return false;
  }
  return true;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeRuleValue = (value) => String(value || '').trim().toLowerCase();

const addressRulesOverlap = (left = {}, right = {}) => {
  const leftFields = ADDRESS_MAPPING_FIELDS.filter((field) => normalizeRuleValue(left[field]));
  const rightFields = ADDRESS_MAPPING_FIELDS.filter((field) => normalizeRuleValue(right[field]));
  if (!leftFields.length || !rightFields.length) return false;
  return leftFields.every((field) => (
    !normalizeRuleValue(right[field])
    || normalizeRuleValue(left[field]) === normalizeRuleValue(right[field])
  )) && rightFields.every((field) => (
    !normalizeRuleValue(left[field])
    || normalizeRuleValue(left[field]) === normalizeRuleValue(right[field])
  ));
};

const findRuleConflict = async (addressMapping, excludedId = null) => {
  const query = Area.find({ isActive: { $ne: false } })
    .select('name addressMapping')
    .lean();
  const activeAreas = await query;
  return activeAreas.find((area) => (
    (!excludedId || String(area._id) !== String(excludedId))
    && addressRulesOverlap(addressMapping, area.addressMapping)
  )) || null;
};

const findNameConflict = async (name, excludedId = null) => {
  const query = { normalizedName: normalizeRuleValue(name) };
  if (excludedId) query._id = { $ne: excludedId };
  return Area.findOne(query).select('name').lean();
};

const buildAdminAssignmentFilter = (name) => {
  const exactName = buildCanonicalAreaPattern(name);
  const areaKey = canonicalAreaKey(name);
  const assignedAreaIsEmpty = {
    $or: [
      { assignedArea: { $exists: false } },
      { assignedArea: '' },
      { assignedArea: null },
    ],
  };
  return {
    role: 'admin',
    $and: [
      { $or: [
        { adminType: 'area' },
        { adminType: { $exists: false }, adminAreas: { $ne: [] } },
        { adminType: null, adminAreas: { $ne: [] } },
      ] },
      {
        $or: [
          { assignedAreaKey: areaKey },
          { assignedArea: exactName },
          {
            $and: [
              assignedAreaIsEmpty,
              {
                $or: [
                  { 'adminAreas.region': exactName },
                  { 'adminAreas.zone': exactName },
                  { 'adminAreas.wereda': exactName },
                  { 'adminAreas.city': exactName },
                  { 'adminAreas.subCity': exactName },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
};

const getAreas = async (req, res) => {
  try {
    const areas = await Area.find().select('name canonicalKey region addressMapping isActive').sort({ name: 1 }).lean();
    const areaSummaries = await Promise.all(areas.map(async (area) => {
      const propertyFilter = buildAssignedAreaQuery(area.name);
      const properties = await Property.find(propertyFilter).select('_id').lean();
      const propertyIds = properties.map((property) => property._id);
      const [activeAdminCount, pendingPropertyCount, pendingRentalRequestCount, unreadMessageCount] = await Promise.all([
        User.countDocuments({ ...buildAdminAssignmentFilter(area.name), isActive: { $ne: false } }),
        Property.countDocuments({ ...propertyFilter, verificationStatus: 'pending', isVerified: false }),
        propertyIds.length
          ? RentalRequest.countDocuments({ property: { $in: propertyIds }, status: 'pending' })
          : 0,
        ContactMessage.countDocuments({
          ...buildCanonicalAreaQuery(area.name, { keyField: 'areaKey', valueField: 'area' }),
          read: false,
        }),
      ]);
      const activeAdmin = activeAdminCount
        ? await User.findOne({
          ...buildAdminAssignmentFilter(area.name),
          isActive: { $ne: false },
        }).select('name status isActive').lean()
        : null;
      const [allAreaAdminCount, historyCount] = await Promise.all([
        User.countDocuments(buildAdminAssignmentFilter(area.name)),
        ContactMessage.countDocuments(buildCanonicalAreaQuery(area.name, { keyField: 'areaKey', valueField: 'area' })),
      ]);
      const areaAdmin = activeAdmin || (allAreaAdminCount
        ? await User.findOne(buildAdminAssignmentFilter(area.name)).select('name status isActive').lean()
        : null);
      const waitingItemCount = pendingPropertyCount + pendingRentalRequestCount + unreadMessageCount;

      return {
        ...area,
        activeAdminCount,
        areaAdmin: areaAdmin ? {
          name: areaAdmin.name,
          status: areaAdmin.status || 'active',
          isActive: areaAdmin.isActive !== false,
        } : null,
        propertyCount: properties.length,
        waitingPropertyCount: pendingPropertyCount,
        waitingItemCount,
        historyCount,
        adminCount: allAreaAdminCount,
        hasNoActiveAdminWithWaitingItems: activeAdminCount === 0 && waitingItemCount > 0,
      };
    }));

    if (req.query?.includeSummary === 'true') {
      const unassignedPropertyCount = await Property.countDocuments({ area: UNASSIGNED_AREA });
      const areasWithAdmin = areaSummaries.filter((area) => area.activeAdminCount > 0).length;
      return res.json({
        areas: areaSummaries,
        totals: {
          totalAreas: areaSummaries.length,
          areasWithAdmin,
          areasWithoutAdmin: areaSummaries.length - areasWithAdmin,
          unassignedProperties: unassignedPropertyCount,
        },
      });
    }

    res.json(areaSummaries);
  } catch (error) {
    console.error('Area list lookup failed:', error);
    res.status(500).json({ message: 'Unable to load areas.' });
  }
};

const getPublicAreas = async (_req, res) => {
  try {
    const areas = await Area.find({ isActive: { $ne: false } })
      .select('name region addressMapping')
      .sort({ name: 1 })
      .lean();
    res.json(areas);
  } catch (error) {
    console.error('Public area list lookup failed:', error);
    res.status(500).json({ message: 'Unable to load areas.' });
  }
};

const getUnassignedProperties = async (req, res) => {
  try {
    const properties = await Property.find({ area: UNASSIGNED_AREA })
      .select('_id title location region zone wereda city createdAt')
      .sort({ createdAt: 1 })
      .lean();
    res.json(properties);
  } catch (error) {
    console.error('Unassigned property lookup failed:', error);
    res.status(500).json({ message: 'Unable to load properties without an assigned area.' });
  }
};

const assignMappedUnassignedProperties = async () => {
  const [areas, properties] = await Promise.all([
    Area.find({ isActive: { $ne: false } }).select('name addressMapping').lean(),
    Property.find({ area: UNASSIGNED_AREA }).select('_id region zone wereda city').lean(),
  ]);
  for (const property of properties) {
    const areaName = matchAreaFromAddress(property, areas);
    if (!areaName) continue;
    await Property.updateOne(
      { _id: property._id, area: UNASSIGNED_AREA },
      { $set: { area: areaName, areaKey: canonicalAreaKey(areaName) } },
    );
  }
};

const createArea = async (req, res) => {
  try {
    const fields = normalizePlaceFields(req.body);
    if (!validatePlaceFields(fields, res)) return;

    if (await findNameConflict(fields.name)) {
      return res.status(409).json({ message: 'A place with that name already exists.' });
    }
    const conflictingArea = await findRuleConflict(fields.addressMapping);
    if (conflictingArea) {
      return res.status(409).json({
        message: 'Address matching rules overlap with another active area.',
        conflictingArea: conflictingArea.name,
      });
    }

    const area = await Area.create(fields);
    await assignMappedUnassignedProperties();
    await logAudit({
      req, action: 'AREA_CREATED', module: 'areas',
      targetType: 'area', targetId: area._id, targetLabel: area.name,
      details: { region: area.region, addressMapping: area.addressMapping },
      description: `Platform Admin ${req.user?.name || 'Administrator'} created area ${area.name}.`,
    });
    res.status(201).json({ message: 'Place added successfully.', area });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'A place with that name already exists.' });
    console.error('Place creation failed:', error);
    res.status(500).json({ message: 'Unable to add place.' });
  }
};

const updateArea = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid place ID.' });
    }
    const fields = normalizePlaceFields(req.body);
    if (!validatePlaceFields(fields, res)) return;

    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: 'Place not found.' });
    if (await findNameConflict(fields.name, area._id)) {
      return res.status(409).json({ message: 'A place with that name already exists.' });
    }
    const conflictingArea = await findRuleConflict(fields.addressMapping, area._id);
    if (conflictingArea) {
      return res.status(409).json({
        message: 'Address matching rules overlap with another active area.',
        conflictingArea: conflictingArea.name,
      });
    }

    const previous = {
      name: area.name,
      region: area.region,
      addressMapping: area.addressMapping?.toObject?.() || area.addressMapping,
    };
    const previousName = area.name;
    area.name = fields.name;
    area.region = fields.region;
    area.addressMapping = fields.addressMapping;
    await area.save();
    if (previousName.toLowerCase() !== area.name.toLowerCase()) {
      const previousNamePattern = new RegExp(
        `^${previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'i',
      );
      await Promise.all([
        User.updateMany(
          buildAdminAssignmentFilter(previousName),
          {
            $set: {
              assignedArea: area.name,
              assignedAreaKey: canonicalAreaKey(area.name),
              adminAreas: [{ city: area.name }],
            },
          },
        ),
        User.updateMany({ area: previousNamePattern }, { $set: { area: area.name } }),
        Property.updateMany(
          { area: previousNamePattern },
          { $set: { area: area.name, areaKey: canonicalAreaKey(area.name) } },
        ),
        ContactMessage.updateMany(
          buildCanonicalAreaQuery(previousName, { keyField: 'areaKey', valueField: 'area' }),
          { $set: { area: area.name, areaKey: canonicalAreaKey(area.name) } },
        ),
      ]);
    }
    await assignMappedUnassignedProperties();
    await logAudit({
      req, action: 'AREA_UPDATED', module: 'areas',
      targetType: 'area', targetId: area._id, targetLabel: area.name,
      details: { before: previous, after: fields },
      description: `Platform Admin ${req.user?.name || 'Administrator'} updated area ${area.name}.`,
    });
    res.json({ message: 'Place updated successfully.', area });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'A place with that name already exists.' });
    console.error('Place update failed:', error);
    res.status(500).json({ message: 'Unable to update place.' });
  }
};

const setAreaActive = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid place ID.' });
    }
    if (typeof req.body?.isActive !== 'boolean') {
      return res.status(400).json({ message: 'Area status must be true or false.' });
    }
    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: 'Place not found.' });
    if (area.isActive === req.body.isActive) {
      return res.json({ message: req.body.isActive ? 'Place enabled successfully.' : 'Place disabled successfully.', area });
    }
    if (req.body.isActive) {
      const conflictingArea = await findRuleConflict(area.addressMapping, area._id);
      if (conflictingArea) {
        return res.status(409).json({
          message: 'Address matching rules overlap with another active area.',
          conflictingArea: conflictingArea.name,
        });
      }
    }
    area.isActive = req.body.isActive;
    await area.save();
    if (area.isActive) await assignMappedUnassignedProperties();
    await logAudit({
      req,
      action: area.isActive ? 'AREA_ENABLED' : 'AREA_DISABLED',
      module: 'areas',
      targetType: 'area',
      targetId: area._id,
      targetLabel: area.name,
      details: { isActive: area.isActive },
      description: `Platform Admin ${req.user?.name || 'Administrator'} ${area.isActive ? 'enabled' : 'disabled'} area ${area.name}.`,
    });
    return res.json({ message: area.isActive ? 'Place enabled successfully.' : 'Place disabled successfully.', area });
  } catch (error) {
    console.error('Area status update failed:', error);
    return res.status(500).json({ message: 'Unable to update place status.' });
  }
};

const deleteArea = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid place ID.' });
    }
    const area = await Area.findById(req.params.id).select('name');
    if (!area) return res.status(404).json({ message: 'Place not found.' });

    const propertyFilter = buildAssignedAreaQuery(area.name);
    const properties = await Property.find(propertyFilter).select('_id').lean();
    const propertyIds = properties.map((property) => property._id);
    const [adminCount, propertyCount, rentalHistoryCount, messageHistoryCount] = await Promise.all([
      User.countDocuments(buildAdminAssignmentFilter(area.name)),
      Property.countDocuments(propertyFilter),
      propertyIds.length ? RentalRequest.countDocuments({ property: { $in: propertyIds } }) : 0,
      ContactMessage.countDocuments(buildCanonicalAreaQuery(area.name, { keyField: 'areaKey', valueField: 'area' })),
    ]);
    const historyCount = rentalHistoryCount + messageHistoryCount;
    if (adminCount || propertyCount || historyCount) {
      return res.status(409).json({
        message: 'This area cannot be deleted because it still has properties, admins, or history. Disable it instead.',
        counts: { properties: propertyCount, areaAdmins: adminCount, history: historyCount },
        suggestion: 'Disable this area instead.',
      });
    }

    await area.deleteOne();
    await logAudit({
      req, action: 'AREA_DELETED', module: 'areas',
      targetType: 'area', targetId: area._id, targetLabel: area.name,
      description: `Platform Admin ${req.user?.name || 'Administrator'} deleted area ${area.name}.`,
    });
    return res.json({ message: 'Place deleted successfully.' });
  } catch (error) {
    console.error('Place deletion failed:', error);
    return res.status(500).json({ message: 'Unable to delete place.' });
  }
};

module.exports = {
  getAreas,
  getPublicAreas,
  getUnassignedProperties,
  assignMappedUnassignedProperties,
  createArea,
  updateArea,
  setAreaActive,
  deleteArea,
  addressRulesOverlap,
};
