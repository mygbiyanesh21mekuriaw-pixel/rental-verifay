const mongoose = require('mongoose');
const Area = require('../models/Area');
const User = require('../models/User');
const Property = require('../models/Property');
const ContactMessage = require('../models/ContactMessage');

const normalizePlaceFields = (body = {}) => ({
  name: typeof body.name === 'string' ? body.name.trim() : '',
  region: typeof body.region === 'string' ? body.region.trim() : '',
});

const validatePlaceFields = ({ name, region }, res) => {
  if (!name) {
    res.status(400).json({ message: 'Place name is required.' });
    return false;
  }
  if (name.length > 120 || region.length > 120) {
    res.status(400).json({ message: 'Place name and region must be 120 characters or fewer.' });
    return false;
  }
  return true;
};

const buildAdminAssignmentFilter = (name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactName = new RegExp(`^${escapedName}$`, 'i');
  return {
    role: 'admin',
    $or: [
      { assignedArea: exactName },
      { 'adminAreas.region': exactName },
      { 'adminAreas.zone': exactName },
      { 'adminAreas.wereda': exactName },
      { 'adminAreas.city': exactName },
      { 'adminAreas.subCity': exactName },
    ],
  };
};

const getAreas = async (req, res) => {
  try {
    const areas = await Area.find().select('name region').sort({ name: 1 }).lean();
    res.json(areas);
  } catch (error) {
    console.error('Area list lookup failed:', error);
    res.status(500).json({ message: 'Unable to load areas.' });
  }
};

const createArea = async (req, res) => {
  try {
    const fields = normalizePlaceFields(req.body);
    if (!validatePlaceFields(fields, res)) return;

    const area = await Area.create(fields);
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

module.exports = { getAreas, createArea, updateArea, deleteArea };
