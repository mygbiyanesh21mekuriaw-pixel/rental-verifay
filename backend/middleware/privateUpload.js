const path = require('path');
const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const { auth } = require('./auth');
const { normalizeAdminAreaObject, propertyMatchesAdminAreas } = require('../utils/adminArea');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const canAccessPropertyDocument = (user, property) => {
  if (user.role === 'landlord' && String(property.landlord) === String(user.id)) return true;
  if (user.role !== 'admin') return false;
  if (user.adminType === 'platform') return true;

  const adminAreas = (user.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
  return adminAreas.length > 0 && propertyMatchesAdminAreas(property, adminAreas);
};

const privateUploadAccess = async (req, res, next) => {
  let filename;
  try {
    filename = path.basename(decodeURIComponent(req.path));
  } catch (error) {
    return res.status(400).json({ message: 'Invalid upload path' });
  }
  if (!filename || filename !== req.path.slice(1)) return res.status(404).end();

  const uploadPath = new RegExp(`/uploads/${escapeRegex(filename)}$`, 'i');

  try {
    let property = await Property.findOne({ verificationDocument: { $regex: uploadPath } })
      .select('_id landlord region zone wereda city subCity')
      .lean();

    if (!property) {
      const verificationRequest = await VerificationRequest.findOne({ documentUrl: { $regex: uploadPath } })
        .select('property')
        .lean();
      if (!verificationRequest) return next();
      property = await Property.findById(verificationRequest.property)
        .select('_id landlord region zone wereda city subCity')
        .lean();
      if (!property) return res.status(404).end();
    }

    return auth(req, res, () => {
      if (!canAccessPropertyDocument(req.user, property)) {
        return res.status(404).end();
      }
      return next();
    });
  } catch (error) {
    console.error('Private upload authorization failed:', error);
    return res.status(503).json({ message: 'Unable to verify upload access' });
  }
};

module.exports = { privateUploadAccess, canAccessPropertyDocument };
