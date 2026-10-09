const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Property = require('../models/Property');

const resolveAuthenticatedUser = async (decoded) => {
  if (!mongoose.isValidObjectId(decoded?.id)) return null;

  const user = await User.findById(decoded.id)
    .select('_id role adminType adminAreas')
    .lean();
  if (!user) return null;

  const adminAreas = user.adminAreas || [];
  return {
    id: String(user._id),
    role: user.role,
    adminType: user.role === 'admin'
      ? user.adminType || (adminAreas.length > 0 ? 'area' : 'platform')
      : undefined,
    adminAreas,
  };
};

const verifyToken = (req, res) => {
  const authorization = req.header('Authorization');
  const tokenMatch = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;
  if (!tokenMatch) {
    res.status(401).json({ message: 'No token, authorization denied' });
    return null;
  }

  try {
    return jwt.verify(tokenMatch[1], process.env.JWT_SECRET);
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
    return null;
  }
};

// ተጠቃሚው መግቢያ መሆኑን ያረጋግጣል
const auth = async (req, res, next) => {
  const decoded = verifyToken(req, res);
  if (!decoded) return;

  try {
    const user = await resolveAuthenticatedUser(decoded);
    if (!user) {
      return res.status(401).json({ message: 'User account is not available' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication user lookup failed:', error);
    return res.status(503).json({ message: 'Unable to verify user account' });
  }
};

const optionalAuth = async (req, res, next) => {
  if (!req.header('Authorization')) return next();
  const decoded = verifyToken(req, res);
  if (!decoded) return;

  try {
    const user = await resolveAuthenticatedUser(decoded);
    if (!user) {
      return res.status(401).json({ message: 'User account is not available' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Optional authentication user lookup failed:', error);
    return res.status(503).json({ message: 'Unable to verify user account' });
  }
};

// Admin ብቻ መሆኑን ያረጋግጣል
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

const areaAdminOnly = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    const user = await User.findById(req.user.id).select('role adminType adminAreas');
    const isAreaAdmin = user && user.role === 'admin' && user.adminType === 'area';
    if (!isAreaAdmin) {
      return res.status(403).json({ message: 'Area Admin permission required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Unable to verify area admin permission' });
  }
};

const platformAdminOnly = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    const user = await User.findById(req.user.id).select('role adminType adminAreas');
    const isPlatformAdmin = user && user.role === 'admin' && (
      user.adminType === 'platform' || (!user.adminType && (!user.adminAreas || user.adminAreas.length === 0))
    );
    if (!isPlatformAdmin) {
      return res.status(403).json({ message: 'Platform Admin permission required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Unable to verify platform admin permission' });
  }
};

// Landlord ብቻ መሆኑን ያረጋግጣል
const landlordOnly = (req, res, next) => {
  if (req.user.role !== 'landlord' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Landlord only.' });
  }
  next();
};

const landlordCreateOnly = (req, res, next) => {
  if (req.user.role !== 'landlord') {
    return res.status(403).json({ message: 'Only landlords can create properties.' });
  }
  next();
};

const landlordOwnerOrPlatformAdmin = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id).select('_id landlord');
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const isOwner = req.user.role === 'landlord'
      && String(property.landlord) === String(req.user.id);
    const isPlatformAdmin = req.user.role === 'admin' && req.user.adminType === 'platform';
    if (!isOwner && !isPlatformAdmin) {
      return res.status(403).json({ message: 'Not authorized to manage this property' });
    }

    req.property = property;
    next();
  } catch (error) {
    console.error('Property authorization lookup failed:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Property not found' });
    }
    res.status(503).json({ message: 'Unable to verify property ownership' });
  }
};

module.exports = {
  auth,
  optionalAuth,
  adminOnly,
  areaAdminOnly,
  platformAdminOnly,
  landlordOnly,
  landlordCreateOnly,
  landlordOwnerOrPlatformAdmin,
};