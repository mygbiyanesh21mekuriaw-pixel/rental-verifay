const jwt = require('jsonwebtoken');

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

module.exports = { auth, optionalAuth, adminOnly, landlordOnly, landlordCreateOnly };