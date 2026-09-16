const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ተጠቃሚው መግቢያ መሆኑን ያረጋግጣል
const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role } ይይዛል
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
};

const optionalAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
  next();
};

// Admin ብቻ መሆኑን ያረጋግጣል
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
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

module.exports = { auth, optionalAuth, adminOnly, platformAdminOnly, landlordOnly, landlordCreateOnly };