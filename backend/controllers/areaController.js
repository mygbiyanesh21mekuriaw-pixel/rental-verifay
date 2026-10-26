const mongoose = require('mongoose');
const Area = require('../models/Area');
const User = require('../models/User');
const Property = require('../models/Property');
const ContactMessage = require('../models/ContactMessage');
const RentalRequest = require('../models/RentalRequest');
const { buildAssignedAreaQuery } = require('../utils/area');
const { ADDRESS_MAPPING_FIELDS, matchAreaFromAddress, UNASSIGNED_AREA } = require('../utils/propertyArea');

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
  return true;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildAdminAssignmentFilter = (name) => {
  const escapedName = escapeRegex(name);
  const exactName = new RegExp(`^${escapedName}$`, 'i');
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
    const areas = await Area.find().select('name region addressMapping').sort({ name: 1 }).lean();
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
          area: new RegExp(`^${escapeRegex(area.name)}$`, 'i'),
          read: false,
        }),
      ]);
      const waitingItemCount = pendingPropertyCount + pendingRentalRequestCount + unreadMessageCount;

      return {
        ...area,
        activeAdminCount,
        waitingItemCount,
        hasNoActiveAdminWithWaitingItems: activeAdminCount === 0 && waitingItemCount > 0,
      };
    }));

    res.json(areaSummaries);
  } catch (error) {
    console.error('Area list lookup failed:', error);
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
    Area.find().select('name addressMapping').lean(),
    Property.find({ area: UNASSIGNED_AREA }).select('_id region zone wereda city').lean(),
  ]);
  for (const property of properties) {
    const areaName = matchAreaFromAddress(property, areas);
    if (!areaName) continue;
    await Property.updateOne(
      { _id: property._id, area: UNASSIGNED_AREA },
      { $set: { area: areaName } },
    );
  }
};

const createArea = async (req, res) => {
  try {
    const fields = normalizePlaceFields(req.body);
    if (!validatePlaceFields(fields, res)) return;

    const area = await Area.create(fields);
    await assignMappedUnassignedProperties();
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
          { $set: { assignedArea: area.name, adminAreas: [{ city: area.name }] } },
        ),
        User.updateMany({ area: previousNamePattern }, { $set: { area: area.name } }),
        Property.updateMany({ area: previousNamePattern }, { $set: { area: area.name } }),
        ContactMessage.updateMany({ area: previousNamePattern }, { $set: { area: area.name } }),
      ]);
    }
    await assignMappedUnassignedProperties();
    res.json({ message: 'Place updated successfully.', area });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'A place with that name already exists.' });
    console.error('Place update failed:', error);
    res.status(500).json({ message: 'Unable to update place.' });
  }
};

const deleteArea = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid place ID.' });
    }
    const area = await Area.findById(req.params.id).select('name');
    if (!area) return res.status(404).json({ message: 'Place not found.' });

    const assignedAdmin = await User.exists(buildAdminAssignmentFilter(area.name));
    if (assignedAdmin) {
      return res.status(409).json({ message: 'This place is assigned to an admin and cannot be deleted.' });
    }

    await area.deleteOne();
    res.json({ message: 'Place deleted successfully.' });
  } catch (error) {
    console.error('Place deletion failed:', error);
    res.status(500).json({ message: 'Unable to delete place.' });
  }
};

module.exports = {
  getAreas,
  getUnassignedProperties,
  assignMappedUnassignedProperties,
  createArea,
  updateArea,
  deleteArea,
};
