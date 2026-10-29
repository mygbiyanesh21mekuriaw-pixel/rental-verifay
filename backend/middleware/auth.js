const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Property = require('../models/Property');
const { getUserPermissions } = require('../services/userPermissions');
const { permissionRoleForUser, PERMISSION_CATALOG } = require('../config/permissionCatalog');
const requirePermission = require('./requirePermission');

const getAdministrativeRole = (user) => {
  if (user?.role === 'platform_admin' || user?.role === 'area_admin') return user.role;
  if (user?.role !== 'admin') return user?.role;
  return user.adminType === 'area' || (!user.adminType && (user.adminAreas || []).length > 0)
    ? 'area_admin'
    : 'platform_admin';
};

const getLegacyAssignedArea = (adminAreas) => {
  const firstArea = Array.isArray(adminAreas) ? adminAreas[0] : null;
  if (typeof firstArea === 'string') return firstArea.trim();
  if (!firstArea || typeof firstArea !== 'object') return '';
  return ['city', 'region', 'zone', 'wereda', 'subCity']
    .map((field) => String(firstArea[field] || '').trim())
    .find(Boolean) || '';
};

const resolveAuthenticatedUser = async (decoded) => {
  if (!mongoose.isValidObjectId(decoded?.id)) return null;

  const user = await User.findById(decoded.id)
    .select('_id name email role adminType adminAreas assignedArea area mustChangePassword isActive status')
    .lean();
  if (!user) return null;

  const adminAreas = user.adminAreas || [];
  const adminType = user.role === 'admin'
    ? user.adminType || (adminAreas.length > 0 ? 'area' : 'platform')
    : undefined;
  const effectiveRole = permissionRoleForUser({ ...user, adminType });
  const status = ['pending', 'active', 'suspended', 'rejected'].includes(user.status) ? user.status : 'active';
  if (user.isActive === false && effectiveRole !== 'platform_admin' && !['suspended', 'rejected'].includes(status)) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    adminType,
    adminAreas,
    assignedArea: user.assignedArea || getLegacyAssignedArea(adminAreas),
    area: user.area || '',
    mustChangePassword: user.mustChangePassword === true,
    isActive: user.isActive !== false,
    status,
    sessionId: decoded.sessionId || decoded.jti || '',
    permissions: await getUserPermissions(user._id, effectiveRole),
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
    const isPlatformAdmin = permissionRoleForUser(user) === 'platform_admin';
    if (!isPlatformAdmin && user.status === 'pending') {
      return res.status(403).json({ message: 'Your account is waiting for Platform Admin approval.' });
    }
    if (!isPlatformAdmin && user.status === 'rejected') {
      return res.status(403).json({ message: 'Your account application was rejected.' });
    }
    if (!isPlatformAdmin && user.status === 'suspended') {
      return res.status(403).json({ message: 'Your account is suspended.' });
    }
      const requestPath = `${req.baseUrl || ''}${req.path || ''}`;
      const isAllowedDuringPasswordChange = (
        req.method === 'POST' && ['/api/change-password', '/api/logout', '/api/auth/logout'].includes(requestPath)
      ) || (req.method === 'GET' && requestPath === '/api/auth/me');
      if (user.mustChangePassword && !isAllowedDuringPasswordChange) {
        return res.status(403).json({
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Change your temporary password before continuing.',
        });
      }
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
    const isPlatformAdmin = permissionRoleForUser(user) === 'platform_admin';
    if (!isPlatformAdmin && user.status === 'pending') {
      return res.status(403).json({ message: 'Your account is waiting for Platform Admin approval.' });
    }
    if (!isPlatformAdmin && user.status === 'rejected') {
      return res.status(403).json({ message: 'Your account application was rejected.' });
    }
    if (!isPlatformAdmin && user.status === 'suspended') {
      return res.status(403).json({ message: 'Your account is suspended.' });
    }
    const requestPath = `${req.baseUrl || ''}${req.path || ''}`;
    const isAllowedDuringPasswordChange = (
      req.method === 'POST' && ['/api/change-password', '/api/logout', '/api/auth/logout'].includes(requestPath)
    ) || (req.method === 'GET' && requestPath === '/api/auth/me');
    if (user.mustChangePassword && !isAllowedDuringPasswordChange) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your temporary password before continuing.',
      });
    }
    next();
  } catch (error) {
    console.error('Optional authentication user lookup failed:', error);
    return res.status(503).json({ message: 'Unable to verify user account' });
  }
};

// Admin ብቻ መሆኑን ያረጋግጣል
const requireRole = (...roles) => (req, res, next) => {
  const role = getAdministrativeRole(req.user);
  if (!roles.includes(role) && !(role === 'platform_admin' && roles.includes('admin'))) {
    const message = roles.length === 1 && roles[0] === 'platform_admin'
      ? 'Platform Admin permission required.'
      : 'Access denied. Insufficient permissions.';
    return res.status(403).json({ message });
  }
  req.user.accessRole = role;
  next();
};

const requireAdminPropertyPermission = (req, res, next) => {
  const role = getAdministrativeRole(req.user);
  if (role !== 'area_admin') return next();
  const status = String(req.query.status || '').toLowerCase();
  if (status === 'all') return next();
  const featureKey = {
    pending: 'pendingProperties',
    approved: 'verifiedProperties',
    verified: 'verifiedProperties',
    rejected: 'rejectedProperties',
  }[status] || 'allProperties';
  return requirePermission(featureKey)(req, res, next);
};

const requirePropertyAccess = (req, res, next) => {
  if (!req.user) return next();
  const role = getAdministrativeRole(req.user);
  if (role === 'platform_admin') return next();
  if (!PERMISSION_CATALOG[role]) return res.status(403).json({ message: 'Permission denied' });
  if (role === 'tenant') {
    if (req.params?.id) {
      const canViewDetails = req.user.permissions?.verifiedProperties === true
        || req.user.permissions?.searchProperties === true;
      return canViewDetails ? next() : res.status(403).json({ message: 'Permission denied' });
    }
    const searchFields = [
      'search', 'title', 'description', 'location', 'address', 'region', 'zone', 'wereda',
      'city', 'subCity', 'kebele', 'houseNumber', 'price', 'minPrice', 'maxPrice',
      'bedrooms', 'availability', 'sortPrice',
    ];
    const hasSearchFilters = searchFields.some((field) => req.query?.[field] !== undefined);
    const permissionKey = req.query?.feature === 'searchProperties' || hasSearchFilters
      ? 'searchProperties'
      : 'verifiedProperties';
    const allowed = req.user.permissions?.[permissionKey] === true;
    return allowed ? next() : res.status(403).json({ message: 'Permission denied' });
  }
  const permissionKey = role === 'landlord'
    ? 'myProperties'
    : role === 'area_admin'
      ? 'allProperties'
      : null;
  if (!permissionKey || req.user.permissions?.[permissionKey] === true) return next();
  return res.status(403).json({ message: 'Permission denied' });
};

const adminOnly = requireRole('platform_admin', 'area_admin');
const areaAdminOnly = requireRole('area_admin');
const platformAdminOnly = requireRole('platform_admin');

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
  requireRole,
  requirePermission,
  requireAdminPropertyPermission,
  requirePropertyAccess,
  getAdministrativeRole,
  areaAdminOnly,
  platformAdminOnly,
  landlordOnly,
  landlordCreateOnly,
  landlordOwnerOrPlatformAdmin,
};