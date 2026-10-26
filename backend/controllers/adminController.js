const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const RentalRequest = require('../models/RentalRequest');
const Payment = require('../models/Payment');
const User = require('../models/User');
const UserPermission = require('../models/UserPermission');
const Area = require('../models/Area');
const { buildAssignedAreaQuery } = require('../utils/area');
const { getAdministrativeRole } = require('../middleware/auth');
const { isApprovedProperty } = require('../utils/propertyVerification');
const {
  normalizeAdminAreaObject,
  propertyMatchesAdminAreas,
  buildAdminAreaQuery,
} = require('../utils/adminArea');
const { createLandlordNotification } = require('./notificationController');
const { logAudit } = require('../utils/auditLogger');
const {
  ensureUserPermissions,
  getDefaultUserPermissions,
  getUserPermissions,
  replaceUserPermissions,
} = require('../services/userPermissions');
const {
  PERMISSION_CATALOG,
  getPermissionKeys,
  permissionRoleForUser,
  validatePermissionMap,
} = require('../config/permissionCatalog');
const { clearUnfinishedAreaAdminAssignments, getAdminAreaNames } = require('../utils/areaAdminHandover');
const { appendAdminDecision } = require('../utils/adminHandlingHistory');
const {
  getAreaAdminConflict,
  getAreaAdminConflictMessage,
  isAreaAdminDuplicateKeyError,
} = require('../utils/areaAdminUniqueness');

const respondAreaAdminConflict = async (res, areaName, excludeAdminId = null) => {
  const conflictingAdmin = await getAreaAdminConflict(areaName, excludeAdminId);
  return res.status(409).json({
    message: getAreaAdminConflictMessage(areaName, conflictingAdmin?.name),
  });
};

const buildMonthLabel = (monthKey) => {
  if (!monthKey) return 'N/A';
  const [year, month] = String(monthKey).split('-');
  if (!year || !month) return monthKey;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const buildTrendSeries = (records, key = 'month') => {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  return records
    .map((entry) => ({
      key: entry._id?.[key] || entry._id || 'unknown',
      count: Number(entry.count || 0),
    }))
    .map((entry) => ({
      key: entry.key,
      label: key === 'month' ? buildMonthLabel(entry.key) : entry.key,
      value: entry.count,
    }))
    .sort((left, right) => (left.key || '').localeCompare(right.key || ''));
};

const getAreaName = (area) => {
  if (typeof area === 'string') return area.trim();
  if (!area || typeof area !== 'object') return '';
  return ['city', 'region', 'zone', 'wereda', 'subCity']
    .map((field) => String(area[field] || '').trim())
    .find(Boolean) || '';
};

const getAdminAreas = async (adminId) => {
  const admin = await User.findById(adminId).select('adminAreas assignedArea').lean();
  if (admin?.assignedArea) return [admin.assignedArea];
  return (admin?.adminAreas || [])
    .map((area) => normalizeAdminAreaObject(area))
    .filter(Boolean);
};

const applyAdminAreaScope = async (adminId, filter = {}) => {
  const admin = await User.findById(adminId).select('adminType adminAreas assignedArea').lean();
  const isAreaAdmin = admin?.adminType === 'area'
    || (!admin?.adminType && (admin?.adminAreas || []).length > 0);
  if (!isAreaAdmin) return filter;

  if (admin.assignedArea) {
    return {
      ...filter,
      $and: [
        ...(filter.$and || []),
        buildAssignedAreaQuery(admin.assignedArea),
      ],
    };
  }

  const areas = (admin.adminAreas || [])
    .map((area) => normalizeAdminAreaObject(area))
    .filter(Boolean);
  if (areas.length === 0) return { ...filter, _id: null };

  return {
    ...filter,
    $and: [
      ...(filter.$and || []),
      buildAdminAreaQuery(areas),
    ],
  };
};

const sanitizeAdminProperty = (property) => {
  const sanitized = typeof property.toObject === 'function' ? property.toObject() : { ...property };
  sanitized.hasVerificationDocument = Boolean(
    property.verificationDocument || property.verificationDocumentAsset?.publicId,
  );
  delete sanitized.verificationDocument;
  delete sanitized.verificationDocumentAsset;
  return sanitized;
};

const addHandlerStatus = async (properties) => {
  const handledByIds = [...new Set(properties
    .map((property) => String(property.handledBy || ''))
    .filter((id) => mongoose.isValidObjectId(id)))];
  const handlers = handledByIds.length
    ? await User.find({ _id: { $in: handledByIds } })
      .select('role adminType assignedArea adminAreas isActive')
      .lean()
    : [];
  const handlerById = new Map(handlers.map((handler) => [String(handler._id), handler]));

  properties.forEach((property) => {
    const handler = handlerById.get(String(property.handledBy || ''));
    const handlerAreas = handler?.assignedArea
      ? [handler.assignedArea]
      : (handler?.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
    const isCurrentAreaAdmin = getAdministrativeRole(handler) === 'area_admin'
      && handler.isActive !== false
      && handlerAreas.length > 0
      && propertyMatchesAdminAreas(property, handlerAreas);
    property.handledByIsFormerAdmin = Boolean(property.handledBy) && !isCurrentAreaAdmin;
  });
};

const normalizeAdminAreas = (areas) => {
  if (!Array.isArray(areas)) return null;

  const normalizedAreas = areas
    .map((area) => normalizeAdminAreaObject(area))
    .filter(Boolean);

  return normalizedAreas.length > 0 ? normalizedAreas : null;
};

const createAdminAccount = async (req, res) => {
  let requestedAreaName = '';
  try {
    const { fullName, name, email, username, phone, password, adminType = 'area', adminAreas = [] } = req.body;
    const normalizedName = String(fullName || name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const requestedArea = String(req.body.area || req.body.assignedArea || '').trim() || getAreaName(adminAreas[0]);

    if (!normalizedName || !normalizedEmail || !normalizedUsername || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Full name, email, username and temporary password are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
      return res.status(400).json({ message: 'Username must be 3-20 characters and use only letters, numbers, or underscores.' });
    }
    if (!['platform', 'area'].includes(adminType)) {
      return res.status(400).json({ message: 'Admin type must be platform or area' });
    }
    if (normalizedPhone && !/^(?:\+2519\d{8}|09\d{8})$/.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Use +2519XXXXXXXX or 09XXXXXXXX for the phone number.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    let areaRecord = null;
    if (adminType === 'area') {
      if (!requestedArea) return res.status(400).json({ message: 'An assigned area is required for an area admin.' });
      areaRecord = await Area.findOne({ normalizedName: requestedArea.toLowerCase() }).select('name').lean();
      if (!areaRecord) return res.status(400).json({ message: 'Select an existing area.' });
      requestedAreaName = areaRecord.name;
      const conflictingAdmin = await getAreaAdminConflict(areaRecord.name);
      if (conflictingAdmin) {
        return res.status(409).json({
          message: getAreaAdminConflictMessage(areaRecord.name, conflictingAdmin.name),
        });
      }
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }
    const escapedUsername = normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (await User.findOne({
      username: { $regex: `^${escapedUsername}$`, $options: 'i' },
    })) {
      return res.status(409).json({ message: 'That username is already in use.' });
    }

    const admin = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      username: normalizedUsername,
      phone: normalizedPhone,
      password: await bcrypt.hash(password, 10),
      mustChangePassword: adminType === 'area',
      role: 'admin',
      adminType,
      status: 'active',
      assignedArea: adminType === 'area' ? areaRecord.name : '',
      adminAreas: adminType === 'area' ? [{ city: areaRecord.name }] : [],
    });
    await ensureUserPermissions(admin._id, permissionRoleForUser(admin));
    if (adminType === 'area') {
      await logAudit({
        req, action: 'AREA_ADMIN_CREATED', module: 'users',
        targetType: 'user', targetId: admin._id,
        targetLabel: `${admin.name} (${admin.email})`,
        details: { assignedArea: areaRecord.name },
        description: `Platform Admin created area admin ${admin.name} (${admin.email}) for ${areaRecord.name}.`,
      });
    }

    const safeAdmin = admin.toObject();
    delete safeAdmin.password;
    const message = adminType === 'area'
      ? 'Admin created. Please give the temporary password to the admin directly. They must change it on first login.'
      : 'Admin account created successfully.';
    res.status(201).json({ message, user: safeAdmin });
  } catch (error) {
    if (isAreaAdminDuplicateKeyError(error)) {
      return respondAreaAdminConflict(res, error.keyValue?.assignedArea || requestedAreaName);
    }
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }
    if (error?.code === 11000 && error?.keyPattern?.username) {
      return res.status(409).json({ message: 'That username is already in use.' });
    }
    res.status(500).json({ message: 'Unable to create admin account' });
  }
};

const getAdminAnalyticsSnapshot = async ({ range = 'all', timezone = 'UTC' } = {}) => {
  const now = new Date();
  const createdAtFilter = {};
  if (range === '30d') {
    createdAtFilter.$gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === '6m') {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - 5);
    createdAtFilter.$gte = start;
  }
  const filterByRange = (filter = {}) => (
    Object.keys(createdAtFilter).length ? { ...filter, createdAt: createdAtFilter } : filter
  );
  const dateExpression = {
    $dateToString: { format: '%Y-%m', date: '$createdAt', timezone },
  };
  const trendPipeline = [
    ...(Object.keys(createdAtFilter).length ? [{ $match: filterByRange() }] : []),
    {
      $group: {
        _id: dateExpression,
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];
  const [
    totalUsers,
    totalTenants,
    totalLandlords,
    totalAdmins,
    totalPlatformAdmins,
    totalAreaAdmins,
    totalProperties,
    verifiedProperties,
    pendingProperties,
    rejectedProperties,
    availableProperties,
    rentedProperties,
    totalRentalRequests,
    pendingRentalRequests,
    approvedRentalRequests,
    rejectedRentalRequests,
    propertyStatusData,
    availabilityStatusData,
    userRoleData,
    rentalRequestStatusData,
    propertyTrendData,
    userTrendData,
    rentalRequestTrendData,
  ] = await Promise.all([
    User.countDocuments(filterByRange()),
    User.countDocuments(filterByRange({ role: 'tenant' })),
    User.countDocuments(filterByRange({ role: 'landlord' })),
    User.countDocuments(filterByRange({ role: 'admin' })),
    User.countDocuments(filterByRange({
      role: 'admin',
      $or: [{ adminType: 'platform' }, { adminType: null }],
    })),
    User.countDocuments(filterByRange({ role: 'admin', adminType: 'area' })),
    Property.countDocuments(filterByRange()),
    Property.countDocuments(filterByRange({ isVerified: true, verificationStatus: 'approved' })),
    Property.countDocuments(filterByRange({ verificationStatus: 'pending' })),
    Property.countDocuments(filterByRange({ verificationStatus: 'rejected' })),
    Property.countDocuments(filterByRange({ availabilityStatus: 'available' })),
    Property.countDocuments(filterByRange({ availabilityStatus: 'rented' })),
    RentalRequest.countDocuments(filterByRange()),
    RentalRequest.countDocuments(filterByRange({ status: 'pending' })),
    RentalRequest.countDocuments(filterByRange({ status: 'approved' })),
    RentalRequest.countDocuments(filterByRange({ status: 'rejected' })),
    Property.aggregate([
      ...(Object.keys(createdAtFilter).length ? [{ $match: filterByRange() }] : []),
      { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Property.aggregate([
      ...(Object.keys(createdAtFilter).length ? [{ $match: filterByRange() }] : []),
      { $group: { _id: '$availabilityStatus', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([
      ...(Object.keys(createdAtFilter).length ? [{ $match: filterByRange() }] : []),
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    RentalRequest.aggregate([
      ...(Object.keys(createdAtFilter).length ? [{ $match: filterByRange() }] : []),
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Property.aggregate(trendPipeline),
    User.aggregate(trendPipeline),
    RentalRequest.aggregate(trendPipeline),
  ]);

  const propertyStatus = {
    verified: verifiedProperties,
    pending: pendingProperties,
    rejected: rejectedProperties,
    available: availableProperties,
    rented: rentedProperties,
  };

  const userRoles = {
    total: totalUsers,
    tenants: totalTenants,
    landlords: totalLandlords,
    admins: totalAdmins,
    platformAdmins: totalPlatformAdmins,
    areaAdmins: totalAreaAdmins,
  };

  const rentalRequestStatus = {
    pending: pendingRentalRequests,
    approved: approvedRentalRequests,
    rejected: rejectedRentalRequests,
    total: totalRentalRequests,
  };

  const normalizeBucket = (records) => {
    const normalized = {};
    records.forEach((entry) => {
      normalized[entry._id || 'unknown'] = Number(entry.count || 0);
    });
    return normalized;
  };

  const propertyBuckets = normalizeBucket(propertyStatusData);
  const userBuckets = normalizeBucket(userRoleData);
  const rentalBuckets = normalizeBucket(rentalRequestStatusData);
  const otherPropertyStatus = Math.max(
    totalProperties - verifiedProperties - pendingProperties - rejectedProperties,
    0,
  );
  const otherAvailabilityStatus = Math.max(totalProperties - availableProperties - rentedProperties, 0);
  const confirmedRentalRequests = rentalBuckets.confirmed || 0;
  const expiredRentalRequests = rentalBuckets.expired || 0;
  const otherRentalRequests = Math.max(
    totalRentalRequests - pendingRentalRequests - approvedRentalRequests - rejectedRentalRequests
      - confirmedRentalRequests - expiredRentalRequests,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalUsers,
      totalTenants,
      totalLandlords,
      totalAdmins,
      totalPlatformAdmins,
      totalAreaAdmins,
      totalProperties,
      verifiedProperties,
      pendingProperties,
      rejectedProperties,
      availableProperties,
      rentedProperties,
      otherPropertyStatus,
      otherAvailabilityStatus,
      totalRentalRequests,
      pendingRentalRequests,
      approvedRentalRequests,
      rejectedRentalRequests,
      confirmedRentalRequests,
      expiredRentalRequests,
      otherRentalRequests,
    },
    propertyStatus: {
      verified: propertyStatus.verified,
      pending: propertyStatus.pending,
      rejected: propertyStatus.rejected,
      other: otherPropertyStatus,
      available: propertyStatus.available,
      rented: propertyStatus.rented,
      otherAvailability: otherAvailabilityStatus,
      breakdown: propertyBuckets,
      availabilityBreakdown: normalizeBucket(availabilityStatusData),
    },
    userRoles: {
      total: totalUsers,
      tenants: totalTenants,
      landlords: totalLandlords,
      admins: totalAdmins,
      platformAdmins: totalPlatformAdmins,
      areaAdmins: totalAreaAdmins,
      breakdown: userBuckets,
    },
    rentalRequestStatus: {
      pending: pendingRentalRequests,
      approved: approvedRentalRequests,
      rejected: rejectedRentalRequests,
      confirmed: confirmedRentalRequests,
      expired: expiredRentalRequests,
      other: otherRentalRequests,
      total: totalRentalRequests,
      breakdown: rentalBuckets,
    },
    trends: {
      propertiesByMonth: buildTrendSeries(propertyTrendData, 'month'),
      usersByMonth: buildTrendSeries(userTrendData, 'month'),
      rentalRequestsByMonth: buildTrendSeries(rentalRequestTrendData, 'month'),
    },
  };
};

// ያልተረጋገጡ ንብረቶችን ማግኘት
const getPendingProperties = async (req, res) => {
  try {
    const filter = await applyAdminAreaScope(req.user.id, {
      verificationStatus: 'pending',
      isVerified: false,
    });
    const pendingProperties = await Property.find(filter)
      .populate('landlord', 'name email phone profilePhoto role')
      .lean();

    await addHandlerStatus(pendingProperties);
    res.json(pendingProperties.map(sanitizeAdminProperty));
  } catch (error) {
    console.error('Verify property failed', { propertyId: req.params.id, adminId: req.user?.id, message: error.message });
    res.status(500).json({ message: 'Unable to verify property', error: error.message });
  }
};

// Admin የንብረት ዝርዝር በሁኔታ ማግኘት
const getAdminProperties = async (req, res) => {
  try {
    const allowedStatuses = ['all', 'approved', 'pending', 'rejected'];
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : 'all';
    const status = allowedStatuses.includes(requestedStatus) ? requestedStatus : 'all';
    const isAreaAdmin = getAdministrativeRole(req.user) === 'area_admin';
    if (!isAreaAdmin && status === 'pending') return res.json([]);
    let filter = status === 'all'
      ? (isAreaAdmin ? {} : { verificationStatus: { $ne: 'pending' } })
      : status === 'approved'
        ? { verificationStatus: 'approved', isVerified: true }
        : { verificationStatus: status, isVerified: false };
    filter = await applyAdminAreaScope(req.user.id, filter);
    const properties = await Property.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const landlordIds = properties
      .map(property => property.landlord)
      .filter(landlordId => mongoose.isValidObjectId(landlordId));
    const landlords = landlordIds.length === 0
      ? []
      : await User.find({ _id: { $in: landlordIds }, role: 'landlord' })
        .select('name email phone profilePhoto role')
        .lean();
    const landlordById = new Map(landlords.map(landlord => [landlord._id.toString(), landlord]));

    properties.forEach(property => {
      const landlord = landlordById.get(String(property.landlord));
      property.landlord = landlord || null;
    });

    const propertiesWithoutLandlord = properties.filter(property => !property.landlord);
    if (propertiesWithoutLandlord.length > 0) {
      const propertyIds = propertiesWithoutLandlord
        .map(property => property._id)
        .filter(propertyId => mongoose.isValidObjectId(propertyId));
      let verificationRequests = [];
      if (propertyIds.length > 0) {
        try {
          verificationRequests = await VerificationRequest.find({ property: { $in: propertyIds } })
            .populate({
              path: 'landlord',
              select: 'name email phone profilePhoto role',
              match: { role: 'landlord' },
            })
            .select('property landlord')
            .lean();
        } catch (lookupError) {
          console.warn('Unable to resolve legacy property owners:', lookupError.message);
        }
      }
      const landlordByProperty = new Map(
        verificationRequests
          .filter(request => request.landlord && mongoose.isValidObjectId(request.property))
          .map(request => [request.property.toString(), request.landlord])
      );

      properties.forEach(property => {
        const landlord = landlordByProperty.get(property._id.toString());
        if (landlord) property.landlord = landlord;
      });
    }

    await addHandlerStatus(properties);
    const visibleProperties = isAreaAdmin && status === 'all'
      ? properties.filter((property) => {
        const permissionKey = property.verificationStatus === 'approved'
          ? 'verifiedProperties'
          : property.verificationStatus === 'rejected'
            ? 'rejectedProperties'
            : 'pendingProperties';
        return req.user.permissions?.[permissionKey] === true;
      })
      : properties;
    res.json(visibleProperties.map(sanitizeAdminProperty));
  } catch (error) {
    console.error('Reject property failed', { propertyId: req.params.id, adminId: req.user?.id, message: error.message });
    res.status(500).json({ message: 'Unable to reject property', error: error.message });
  }
};

// ንብረት ማረጋገጥ (Approve)
const verifyProperty = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const admin = await User.findById(req.user.id).select('name adminType adminAreas assignedArea').lean();
    if (!admin || admin.adminType !== 'area') {
      return res.status(403).json({ message: 'Platform Admins are read-only and cannot verify properties.' });
    }

    const adminAreas = await getAdminAreas(req.user.id);
    if (!propertyMatchesAdminAreas(property, adminAreas)) {
      return res.status(403).json({ message: 'This property is outside your assigned admin area' });
    }

    property.isVerified = true;
    property.verificationStatus = 'approved';
    property.availabilityStatus = property.availabilityStatus || 'available';
    appendAdminDecision(property, admin, 'verified');
    await property.save();

    // የማረጋገጫ ጥያቄውን አዘምን
    await VerificationRequest.findOneAndUpdate(
      { property: property._id },
      {
        status: 'approved',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      }
    );

    await createLandlordNotification(
      property.landlord,
      property._id,
      property.title,
      `Your property "${property.title}" was verified and approved.`,
      'approved'
    );

    await logAudit({
      req, action: 'PROPERTY_VERIFIED', module: 'properties',
      targetType: 'property', targetId: property._id, targetLabel: property.title,
      description: `Area Admin ${admin.name} verified property "${property.title}".`,
    });

    res.json({ message: 'Property verified successfully', property: sanitizeAdminProperty(property) });
  } catch (error) {
    console.error('Verify property failed', {
      propertyId: req.params.id,
      adminId: req.user?.id,
      message: error.message,
    });
    res.status(500).json({ message: 'Server error' });
  }
};

// ንብረት ማረጋገጥ እምቢ ማለት (Reject)
const rejectProperty = async (req, res) => {
  try {
    const { comment } = req.body;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const admin = await User.findById(req.user.id).select('name adminType adminAreas assignedArea').lean();
    if (!admin || admin.adminType !== 'area') {
      return res.status(403).json({ message: 'Platform Admins are read-only and cannot reject properties.' });
    }

    const adminAreas = await getAdminAreas(req.user.id);
    if (!propertyMatchesAdminAreas(property, adminAreas)) {
      return res.status(403).json({ message: 'This property is outside your assigned admin area' });
    }

    property.isVerified = false;
    property.verificationStatus = 'rejected';
    appendAdminDecision(property, admin, 'rejected', comment || 'Documentation insufficient');
    await property.save();

    // የማረጋገጫ ጥያቄውን አዘምን
    await VerificationRequest.findOneAndUpdate(
      { property: property._id },
      {
        status: 'rejected',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        adminComment: comment || 'Documentation insufficient',
      }
    );

    await createLandlordNotification(
      property.landlord,
      property._id,
      property.title,
      `Your property "${property.title}" was rejected.`,
      'rejected',
      comment || 'Please review the verification requirements and resubmit the property.'
    );

    await logAudit({
      req, action: 'PROPERTY_REJECTED', module: 'properties',
      targetType: 'property', targetId: property._id, targetLabel: property.title,
      details: { comment: comment || 'Documentation insufficient.' },
      description: `Area Admin ${admin.name} rejected property "${property.title}".`,
    });

    res.json({ message: 'Property rejected', property: sanitizeAdminProperty(property) });
  } catch (error) {
    console.error('Reject property failed', {
      propertyId: req.params.id,
      adminId: req.user?.id,
      message: error.message,
    });
    res.status(500).json({ message: 'Server error' });
  }
};

// ሁሉንም ተጠቃሚዎች ማግኘት (Admin ብቻ)
const getAllUsers = async (req, res) => {
  try {
    const isAreaAdmin = getAdministrativeRole(req.user) === 'area_admin';
    const queryStatus = req.query?.status;
    if (queryStatus && !['pending', 'active', 'suspended'].includes(String(queryStatus))) {
      return res.status(400).json({ message: 'Status must be pending, active, or suspended.' });
    }
    if (queryStatus === 'pending' && getAdministrativeRole(req.user) !== 'platform_admin') {
      return res.status(403).json({ message: 'Platform Admin access required.' });
    }
    let filter = {};
    if (queryStatus) filter.status = String(queryStatus);
    if (isAreaAdmin) {
      const adminAreas = req.user.assignedArea
        ? [req.user.assignedArea]
        : (req.user.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
      if (adminAreas.length === 0) {
        return res.json([]);
      }
      const properties = await Property.find(buildAdminAreaQuery(adminAreas))
        .select('_id landlord rentedBy')
        .lean();
      const propertyIds = properties.map((property) => property._id);
      const relatedUserIds = new Set(
        properties.flatMap((property) => [property.landlord, property.rentedBy])
          .filter(Boolean)
          .map(String),
      );
      if (propertyIds.length > 0) {
        const rentals = await RentalRequest.find({ property: { $in: propertyIds } })
          .select('tenant landlord')
          .lean();
        rentals.forEach((rental) => {
          if (rental.tenant) relatedUserIds.add(String(rental.tenant));
          if (rental.landlord) relatedUserIds.add(String(rental.landlord));
        });
      }
      if (relatedUserIds.size === 0) return res.json([]);
      filter = {
        _id: { $in: [...relatedUserIds] },
        role: { $in: ['landlord', 'tenant'] },
      };
    }
    const users = isAreaAdmin
      ? await User.find(filter)
        .select('_id name email phone role isActive assignedArea adminType adminAreas')
        .lean()
      : await User.find(filter).select('-password').lean();
    if (isAreaAdmin) return res.json(users);

    const usersWithDeletionStatus = await Promise.all(users.map(async (user) => {
      if (!['landlord', 'tenant'].includes(user.role)) {
        return {
          ...user,
          deletionCounts: { properties: 0, activeRentals: 0, payments: 0 },
          canDelete: false,
        };
      }
      const counts = await getUserDeletionCounts(user._id);
      return {
        ...user,
        deletionCounts: counts,
        canDelete: counts.properties === 0 &&
          counts.activeRentals === 0 &&
          counts.payments === 0,
      };
    }));
    res.json(usersWithDeletionStatus);
  } catch (error) {
    console.error('Unable to load admin users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getUserPermissionDetails = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
    const user = await User.findById(req.params.id)
      .select('_id role adminType adminAreas assignedArea status')
      .lean();
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const actualRole = permissionRoleForUser(user);
    const role = actualRole === 'platform_admin'
      ? 'platform_admin'
      : req.query?.role || actualRole;
    if (!PERMISSION_CATALOG[role]) return res.status(400).json({ message: 'Unknown permission catalog role.' });
    const permissions = role === actualRole
      ? await getUserPermissions(user._id, role)
      : getDefaultUserPermissions(role);
    return res.json({
      role,
      status: ['pending', 'active', 'suspended'].includes(user.status) ? user.status : 'active',
      catalog: getPermissionKeys(role).map((permissionKey) => ({
        permissionKey,
        enabled: permissions[permissionKey] === true,
      })),
      permissions,
    });
  } catch (error) {
    console.error('Unable to load user permissions:', error);
    return res.status(500).json({ message: 'Unable to load user permissions.' });
  }
};

const updateUserPermissions = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
    const { role, status, permissions } = req.body || {};
    if (!['area_admin', 'landlord', 'tenant'].includes(role)) {
      return res.status(400).json({ message: 'Role must be area_admin, landlord, or tenant.' });
    }
    if (!['pending', 'active', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Status must be pending, active, or suspended.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const currentRole = permissionRoleForUser(user);
    if (currentRole === 'platform_admin' || String(user._id) === String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot change a Platform Admin account.' });
    }
    let areaRecord = null;
    if (role === 'area_admin') {
      if (!['tenant', 'landlord'].includes(currentRole)) {
        if (currentRole !== 'area_admin') {
          return res.status(400).json({ message: 'Only tenants and landlords can be promoted to Area Admin.' });
        }
      }
      const assignedArea = String(req.body.area || user.assignedArea || user.area || '').trim();
      if (!assignedArea) {
        return res.status(400).json({ message: 'Assign a valid area before promoting this user to Area Admin.' });
      }
      areaRecord = await Area.findOne({ normalizedName: assignedArea.toLowerCase() }).select('name').lean();
      if (!areaRecord) return res.status(400).json({ message: 'Assign a valid area before promoting this user to Area Admin.' });
      if (currentRole !== 'area_admin') {
        const conflictingAdmin = await getAreaAdminConflict(areaRecord.name, user._id);
        if (conflictingAdmin) {
          return res.status(409).json({ message: getAreaAdminConflictMessage(areaRecord.name, conflictingAdmin.name) });
        }
      }
    }

    const oldStatus = ['pending', 'active', 'suspended'].includes(user.status) ? user.status : 'active';
    const oldPermissions = await getUserPermissions(user._id, currentRole);
    const currentPermissions = role === currentRole ? oldPermissions : getDefaultUserPermissions(role);
    const validation = validatePermissionMap(role, permissions, currentPermissions);
    if (validation.error) return res.status(400).json({ message: validation.error });

    if (role === 'area_admin') {
      user.role = 'admin';
      user.adminType = 'area';
      user.assignedArea = areaRecord.name;
      user.adminAreas = [{ city: areaRecord.name }];
    } else if (currentRole === 'area_admin') {
      await clearUnfinishedAreaAdminAssignments(user);
      user.adminType = undefined;
      user.adminAreas = [];
      user.assignedArea = '';
      user.role = role;
    } else {
      user.role = role;
    }
    user.status = status;
    user.isActive = status !== 'suspended';
    await replaceUserPermissions(user._id, role, validation.permissions, req.user.id, currentRole !== role);
    await user.save();

    const permissionKeysChanged = new Set([
      ...Object.keys(oldPermissions),
      ...Object.keys(validation.permissions),
    ]);
    const permissionChanges = [...permissionKeysChanged]
      .filter((key) => oldPermissions[key] !== validation.permissions[key])
      .map((key) => `${key}: ${oldPermissions[key] ?? 'not assigned'} -> ${validation.permissions[key] ?? 'not assigned'}`);
    const changes = [
      ...(currentRole !== role ? [`role: ${currentRole} -> ${role}`] : []),
      ...(oldStatus !== status ? [`status: ${oldStatus} -> ${status}`] : []),
      ...permissionChanges,
    ];
    const changedFields = {};
    if (currentRole !== role) changedFields.role = { from: currentRole, to: role };
    if (oldStatus !== status) changedFields.status = { from: oldStatus, to: status };
    for (const key of permissionKeysChanged) {
      if (oldPermissions[key] !== validation.permissions[key]) {
        changedFields[`permissions.${key}`] = {
          from: oldPermissions[key] ?? null,
          to: validation.permissions[key] ?? null,
        };
      }
    }
    await logAudit({
      req, action: 'USER_PERMISSIONS_UPDATED', module: 'permissions',
      targetType: 'user', targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      details: changedFields,
      description: `Platform Admin ${req.user?.name || 'Administrator'} updated ${user.name} (${user.email}). ${changes.join('; ') || 'No effective changes.'}`,
    });

    return res.json({
      message: 'User permissions updated successfully.',
      user: { id: String(user._id), role, status },
      permissions: validation.permissions,
    });
  } catch (error) {
    console.error('Unable to update user permissions:', error);
    return res.status(500).json({ message: 'Unable to update user permissions.' });
  }
};

const approveUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (permissionRoleForUser(user) === 'platform_admin') {
      return res.status(403).json({ message: 'Platform Admin accounts cannot be approved or changed here.' });
    }
    if (user.status !== 'pending') return res.status(409).json({ message: 'Only pending users can be approved.' });
    user.status = 'active';
    user.isActive = true;
    await user.save();
    await ensureUserPermissions(user._id, permissionRoleForUser(user));
    await logAudit({
      req, action: 'USER_APPROVED', module: 'users',
      targetType: 'user', targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      description: `Platform Admin ${req.user?.name || 'Administrator'} approved user ${user.name} (${user.email}).`,
    });
    return res.json({ message: 'User approved successfully.', user: { id: String(user._id), status: user.status } });
  } catch (error) {
    console.error('Unable to approve user:', error);
    return res.status(500).json({ message: 'Unable to approve user.' });
  }
};

const createAreaAdmin = async (req, res) => {
  const name = String(req.body?.name || req.body?.fullName || '').trim();
  const emailPrefix = String(req.body?.email || '').split('@')[0].toLowerCase();
  const baseUsername = (emailPrefix.replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 16) || 'area_admin');
  let username = baseUsername.length >= 3 ? baseUsername : `${baseUsername}admin`;

  for (let suffix = 1; await User.findOne({ username: { $regex: `^${username}$`, $options: 'i' } }); suffix += 1) {
    const suffixText = String(suffix);
    username = `${baseUsername.slice(0, 20 - suffixText.length)}${suffixText}`;
  }

  const request = Object.create(req);
  request.body = {
    ...req.body,
    fullName: name,
    username: req.body?.username || username,
    password: req.body?.tempPassword || req.body?.temporaryPassword || req.body?.password,
    adminType: 'area',
  };
  return createAdminAccount(request, res);
};

// የስታቲስቲክስ መረጃ (Admin Dashboard)
const getStats = async (req, res) => {
  try {
    const userIds = await User.distinct('_id');
    const totalProperties = await Property.countDocuments();
    const verifiedProperties = await Property.countDocuments({ isVerified: true, verificationStatus: 'approved' });
    const pendingProperties = await Property.countDocuments({ verificationStatus: 'pending' });
    const rejectedProperties = await Property.countDocuments({ verificationStatus: 'rejected' });
    const orphanedProperties = await Property.countDocuments({ landlord: { $nin: userIds } });
    const totalUsers = await User.countDocuments();
    const landlords = await User.countDocuments({ role: 'landlord' });
    const tenants = await User.countDocuments({ role: 'tenant' });
    const admins = await User.countDocuments({ role: 'admin' });
    const platformAdmins = await User.countDocuments({
      role: 'admin',
      $or: [{ adminType: 'platform' }, { adminType: null }],
    });
    const areaAdmins = await User.countDocuments({ role: 'admin', adminType: 'area' });

    res.json({
      totalProperties,
      verifiedProperties,
      pendingProperties,
      rejectedProperties,
      orphanedProperties,
      totalUsers,
      landlords,
      tenants,
      admins,
      platformAdmins,
      areaAdmins,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// አዲስ አድሚን አናሊቲክስ ማስላት
const getAnalytics = async (req, res) => {
  try {
    const range = ['30d', '6m', 'all'].includes(req.query.range) ? req.query.range : 'all';
    let timezone = 'UTC';
    if (typeof req.query.timezone === 'string') {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: req.query.timezone });
        timezone = req.query.timezone;
      } catch (error) {
        console.warn('Invalid analytics timezone; using UTC.');
      }
    }
    const analytics = await getAdminAnalyticsSnapshot({ range, timezone });
    res.json(analytics);
  } catch (error) {
    console.error('Analytics fetch failed:', error);
    res.status(500).json({ message: 'Unable to load admin analytics', error: error.message });
  }
};

const getAdminPaymentPeriods = async (req, res) => {
  try {
    const payments = await Payment.find({})
      .populate('tenant', 'name email role')
      .populate('landlord', 'name email role')
      .populate('property', 'title location city region subCity zone wereda')
      .sort({ createdAt: -1 })
      .lean();

    res.json(payments.map((payment) => ({
      _id: payment._id,
      tenant: payment.tenant || null,
      landlord: payment.landlord || null,
      property: payment.property || null,
      paymentPeriod: payment.paymentPeriod,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentReference: payment.paymentReference,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    })));
  } catch (error) {
    console.error('Payment period fetch failed:', error);
    res.status(500).json({ message: 'Unable to load payment period data', error: error.message });
  }
};

// ተጠቃሚን መሰረዝ (Admin ብቻ)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const actorRole = getAdministrativeRole(req.user);
    if (actorRole === 'area_admin') {
      return res.status(403).json({ message: 'Area Admins cannot delete users.' });
    }
    if (req.user?.id && String(id) === String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot delete your own account.' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (getAdministrativeRole(user) === 'platform_admin') {
      return res.status(403).json({ message: 'Platform Admin accounts cannot be deleted.' });
    }
    if (getAdministrativeRole(user) === 'area_admin') {
      return res.status(403).json({ message: 'Admin accounts must be managed through Admin Management.' });
    }
    if (!['landlord', 'tenant'].includes(user.role)) {
      return res.status(403).json({ message: 'Only Landlord and Tenant accounts can be deleted.' });
    }

    const counts = await getUserDeletionCounts(user._id);
    if (counts.properties > 0 || counts.activeRentals > 0 || counts.rentalRequests > 0 || counts.payments > 0) {
      return res.status(409).json({
        message: 'This user has related properties, rentals or requests, or payments. Deactivate the account instead.',
        counts,
        suggestion: 'Deactivate',
      });
    }

    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Unable to delete user:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getUserDeletionCounts = async (userId) => {
  const [properties, rentalRequests, rentedProperties, payments] = await Promise.all([
    Property.countDocuments({ landlord: userId }),
    RentalRequest.find({
      $or: [{ tenant: userId }, { landlord: userId }],
    }).select('property status').lean(),
    Property.find({
      $or: [
        { landlord: userId, availabilityStatus: 'rented' },
        { rentedBy: userId },
      ],
    }).select('_id').lean(),
    Payment.countDocuments({ $or: [{ tenant: userId }, { landlord: userId }] }),
  ]);
  const activeRentalPropertyIds = new Set([
    ...rentalRequests
      .filter((rental) => ['approved', 'confirmed'].includes(rental.status))
      .map((rental) => String(rental.property)),
    ...rentedProperties.map((property) => String(property._id)),
  ]);
  return {
    properties,
    activeRentals: activeRentalPropertyIds.size,
    rentalRequests: rentalRequests.length,
    payments,
  };
};

const getAreaAdminRelatedPropertyIds = async (admin) => {
  const adminAreas = admin.assignedArea
    ? [admin.assignedArea]
    : (admin.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
  if (adminAreas.length === 0) return [];
  const properties = await Property.find(buildAdminAreaQuery(adminAreas)).select('_id').lean();
  return properties.map((property) => property._id);
};

const isUserRelatedToAdminArea = async (user, admin) => {
  const propertyIds = await getAreaAdminRelatedPropertyIds(admin);
  if (propertyIds.length === 0) return false;

  if (user.role === 'landlord') {
    const property = await Property.findOne({
      _id: { $in: propertyIds },
      landlord: user._id,
    }).select('_id').lean();
    if (property) return true;
  }

  if (user.role === 'tenant') {
    const [rentedProperty, rentalRequest] = await Promise.all([
      Property.findOne({
        _id: { $in: propertyIds },
        rentedBy: user._id,
      }).select('_id').lean(),
      RentalRequest.findOne({
        property: { $in: propertyIds },
        tenant: user._id,
      }).select('_id').lean(),
    ]);
    if (rentedProperty || rentalRequest) return true;
  }

  return false;
};

const setUserActive = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }
    if (typeof req.body?.isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean.' });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot change your own account status.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (getAdministrativeRole(user) === 'platform_admin') {
      return res.status(403).json({ message: 'Platform Admin accounts cannot be deactivated or activated here.' });
    }

    const actorRole = getAdministrativeRole(req.user);
    if (actorRole === 'area_admin') {
      if (!['landlord', 'tenant'].includes(user.role) ||
        !(await isUserRelatedToAdminArea(user, req.user))) {
        return res.status(403).json({ message: 'This user is outside your assigned area.' });
      }
    }

    if (user.isActive === req.body.isActive && !(req.body.isActive && user.status === 'pending')) {
      return res.json({ message: req.body.isActive ? 'User is already active.' : 'User is already inactive.' });
    }

    const previousStatus = user.status;
    const isAreaAdmin = getAdministrativeRole(user) === 'area_admin';
    if (isAreaAdmin && !req.body.isActive) {
      await clearUnfinishedAreaAdminAssignments(user);
    }
    user.isActive = req.body.isActive;
    user.status = req.body.isActive ? 'active' : 'suspended';
    await user.save();

    await logAudit({
      req,
      action: req.body.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      module: 'users',
      targetType: 'user',
      targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      details: { status: { from: previousStatus, to: user.status } },
      description: `${req.user?.name || 'Administrator'} ${req.body.isActive ? 'activated' : 'suspended'} user ${user.name} (${user.email}).`,
    });

    return res.json({
      message: req.body.isActive ? 'User activated successfully.' : 'User deactivated successfully.',
      user: { _id: user._id, isActive: user.isActive, status: user.status },
    });
  } catch (error) {
    console.error('Unable to update user status:', error);
    return res.status(500).json({ message: 'Unable to update user status.' });
  }
};

// የተጠቃሚ ሚና መቀየር (Admin ብቻ)
const changeUserRole = async (req, res) => {
  let requestedAreaName = '';
  try {
    const { id } = req.params;
    const { role, assignedArea, confirmExistingAccount, existingAccountId } = req.body;

    if (!['tenant', 'landlord', 'area_admin', 'deactivate'].includes(role)) {
      return res.status(400).json({ message: 'Unknown role' });
    }
    if (req.user?.id && String(id) === String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot change your own role.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentRole = getAdministrativeRole(user);
    if (currentRole === 'platform_admin') {
      return res.status(403).json({ message: 'Platform Admin accounts cannot be changed.' });
    }

    if (role === 'area_admin') {
      if (!['tenant', 'landlord'].includes(user.role)) {
        return res.status(400).json({ message: 'Only Landlords and Tenants can be promoted to Area Admin.' });
      }
      const requestedArea = String(assignedArea || '').trim();
      if (!requestedArea) {
        return res.status(400).json({ message: 'Select an area for the Area Admin.' });
      }
      const area = await Area.findOne({ normalizedName: requestedArea.toLowerCase() }).select('name').lean();
      if (!area) return res.status(400).json({ message: 'Select an existing area for the Area Admin.' });
      requestedAreaName = area.name;
      const conflictingAdmin = await getAreaAdminConflict(area.name, user._id);
      if (conflictingAdmin) {
        return res.status(409).json({
          message: getAreaAdminConflictMessage(area.name, conflictingAdmin.name),
        });
      }

      user.role = 'admin';
      user.adminType = 'area';
      user.assignedArea = area.name;
      user.adminAreas = [{ city: area.name }];
      user.isActive = true;
      user.status = 'active';
      user.replacedBy = null;
      await user.save();
      await ensureUserPermissions(user._id, permissionRoleForUser(user));
      await logAudit({
        req, action: 'USER_ROLE_UPDATED', module: 'users',
        targetType: 'user', targetId: user._id,
        targetLabel: `${user.name} (${user.email})`,
        details: { role: { from: currentRole, to: 'area_admin' }, assignedArea: requestedAreaName },
        description: `Platform Admin ${req.user?.name || 'Administrator'} promoted ${user.name} (${user.email}) to Area Admin for ${requestedAreaName}.`,
      });
      const safeUser = user.toObject();
      delete safeUser.password;
      return res.json({ message: 'Area Admin promotion successful.', user: safeUser });
    }

    if (currentRole !== 'area_admin') {
      return res.status(400).json({ message: 'Only Area Admin accounts can be demoted or deactivated here.' });
    }

    if (role === 'deactivate') {
      await clearUnfinishedAreaAdminAssignments(user);
      user.isActive = false;
      user.status = 'suspended';
      user.replacedBy = null;
      await user.save();
      await logAudit({
        req, action: 'AREA_ADMIN_DEACTIVATED', module: 'users',
        targetType: 'user', targetId: user._id,
        targetLabel: `${user.name} (${user.email})`,
        details: { status: { from: 'active', to: 'suspended' } },
        description: `Platform Admin ${req.user?.name || 'Administrator'} suspended Area Admin ${user.name} (${user.email}).`,
      });
      const safeUser = user.toObject();
      delete safeUser.password;
      return res.json({ message: 'Area Admin deactivated successfully.', user: safeUser });
    }

    const existingAccount = await User.findOne({
      email: String(user.email || '').trim().toLowerCase(),
      _id: { $ne: user._id },
      role: { $in: ['tenant', 'landlord'] },
    }).select('_id name email role').lean();

    if (existingAccount && existingAccount.role !== role) {
      return res.status(409).json({
        code: 'EXISTING_ACCOUNT_ROLE_MISMATCH',
        existingAccountRole: existingAccount.role,
        message: `An existing ${existingAccount.role} account uses this email. Select ${existingAccount.role} to use that account.`,
      });
    }
    if (existingAccount && (
      confirmExistingAccount !== true ||
      String(existingAccountId || '') !== String(existingAccount._id)
    )) {
      return res.status(409).json({
        code: 'EXISTING_ACCOUNT_CONFIRMATION_REQUIRED',
        existingAccountId: String(existingAccount._id),
        existingAccountRole: existingAccount.role,
        message: `An existing ${existingAccount.role} account uses this email. Confirm to deactivate this Area Admin and use the existing account.`,
      });
    }

    await clearUnfinishedAreaAdminAssignments(user);
    if (existingAccount) {
      user.isActive = false;
      user.status = 'suspended';
      user.replacedBy = existingAccount._id;
      user.assignedArea = '';
      user.adminAreas = [];
      await user.save();
      await logAudit({
        req, action: 'AREA_ADMIN_LINKED_EXISTING_ACCOUNT', module: 'users',
        targetType: 'user', targetId: user._id,
        targetLabel: `${user.name} (${user.email})`,
        details: { status: { from: 'active', to: 'suspended' }, replacedByRole: existingAccount.role },
        description: `Platform Admin ${req.user?.name || 'Administrator'} linked Area Admin ${user.name} (${user.email}) to the existing ${existingAccount.role} account.`,
      });
      return res.json({
        message: `Existing ${existingAccount.role} account selected. The Area Admin account is deactivated.`,
        user: { id: String(existingAccount._id), role: existingAccount.role },
      });
    }

    user.role = role;
    user.adminType = undefined;
    user.adminAreas = [];
    user.assignedArea = '';
    user.isActive = true;
    user.status = 'active';
    user.replacedBy = null;
    await user.save();
    await ensureUserPermissions(user._id, permissionRoleForUser(user));
    await logAudit({
      req, action: 'AREA_ADMIN_DEMOTED', module: 'users',
      targetType: 'user', targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      details: { role: { from: 'area_admin', to: role } },
      description: `Platform Admin ${req.user?.name || 'Administrator'} changed Area Admin ${user.name} (${user.email}) to ${role}.`,
    });

    const safeUser = user.toObject();
    delete safeUser.password;
    res.json({ message: `Area Admin demoted to ${role}.`, user: safeUser });
  } catch (error) {
    if (isAreaAdminDuplicateKeyError(error)) {
      return respondAreaAdminConflict(res, error.keyValue?.assignedArea || requestedAreaName, req.params.id);
    }
    console.error('Unable to change user role:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateAreaAdminAccount = async (req, res) => {
  let requestedAreaName = '';
  try {
    const { name, email, phone } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const requestedArea = String(req.body.assignedArea || '').trim() || getAreaName(req.body.adminAreas?.[0]);
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedName || !normalizedEmail || !requestedArea) {
      return res.status(400).json({ message: 'Name, email and one valid assigned area are required.' });
    }
    if (normalizedPhone && !/^(?:\+2519\d{8}|09\d{8})$/.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Use +2519XXXXXXXX or 09XXXXXXXX for the phone number.' });
    }
    const areaRecord = await Area.findOne({ normalizedName: requestedArea.toLowerCase() }).select('name').lean();
    if (!areaRecord) return res.status(400).json({ message: 'Select an existing area.' });
    requestedAreaName = areaRecord.name;

    const admin = await User.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: 'Area Admin not found' });
    if (admin.role !== 'admin' || admin.adminType !== 'area') {
      return res.status(403).json({ message: 'Only Area Admin accounts can be edited here' });
    }
    if (String(admin.assignedArea || '').trim().toLowerCase() !== areaRecord.name.toLowerCase()) {
      const conflictingAdmin = await getAreaAdminConflict(areaRecord.name, admin._id);
      if (conflictingAdmin) {
        return res.status(409).json({
          message: getAreaAdminConflictMessage(areaRecord.name, conflictingAdmin.name),
        });
      }
    }

    const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: admin._id } });
    if (existingUser) return res.status(409).json({ message: 'A user with this email already exists' });

    if (String(admin.assignedArea || '').trim().toLowerCase() !== areaRecord.name.toLowerCase()) {
      await clearUnfinishedAreaAdminAssignments(admin);
    }

    admin.set({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      role: 'admin',
      adminType: 'area',
      assignedArea: areaRecord.name,
      adminAreas: [{ city: areaRecord.name }],
    });
    await admin.save();

    const safeAdmin = admin.toObject();
    delete safeAdmin.password;
    res.json({ message: 'Area Admin updated successfully', user: safeAdmin });
  } catch (error) {
    if (isAreaAdminDuplicateKeyError(error)) {
      return respondAreaAdminConflict(res, error.keyValue?.assignedArea || requestedAreaName, req.params.id);
    }
    res.status(500).json({ message: 'Unable to update Area Admin' });
  }
};

const deleteAreaAdminAccount = (_req, res) => res.status(405).json({
  message: 'Admins cannot be deleted. Use Demote or Deactivate.',
});

const setAreaAdminActive = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid Area Admin ID.' });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot change your own account status.' });
    }
    if (typeof req.body?.isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean.' });
    }
    const admin = await User.findById(req.params.id);
    if (admin && getAdministrativeRole(admin) === 'platform_admin') {
      return res.status(403).json({ message: 'Platform Admin accounts cannot be deactivated or activated here.' });
    }
    if (!admin || admin.role !== 'admin' || admin.adminType !== 'area') {
      return res.status(404).json({ message: 'Area Admin not found.' });
    }
    if (admin.isActive === req.body.isActive && !(req.body.isActive && admin.status === 'pending')) {
      return res.json({ message: req.body.isActive ? 'Area Admin is already active.' : 'Area Admin is already inactive.' });
    }

    const previousStatus = admin.status;
    const areaNames = getAdminAreaNames(admin);
    if (!req.body.isActive) {
      await clearUnfinishedAreaAdminAssignments(admin);
    }
    admin.isActive = req.body.isActive;
    admin.status = req.body.isActive ? 'active' : 'suspended';
    await admin.save();

    await logAudit({
      req,
      action: req.body.isActive ? 'AREA_ADMIN_ACTIVATED' : 'AREA_ADMIN_DEACTIVATED',
      module: 'users',
      targetType: 'user',
      targetId: admin._id,
      targetLabel: `${admin.name} (${admin.email})`,
      details: { status: { from: previousStatus, to: admin.status } },
      description: `Platform Admin ${req.user?.name || 'Administrator'} ${req.body.isActive ? 'activated' : 'suspended'} Area Admin ${admin.name} (${admin.email}).`,
    });
    return res.json({ message: req.body.isActive ? 'Area Admin activated successfully.' : 'Area Admin deactivated successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update Area Admin status.' });
  }
};

const resetAreaAdminPassword = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid Area Admin ID.' });
    }
    const { temporaryPassword } = req.body || {};
    if (typeof temporaryPassword !== 'string' || temporaryPassword.length < 8 || temporaryPassword.length > 1024) {
      return res.status(400).json({ message: 'Temporary password must be at least 8 characters.' });
    }

    const admin = await User.findById(req.params.id);
    if (!admin || admin.role !== 'admin' || admin.adminType !== 'area') {
      return res.status(404).json({ message: 'Area Admin not found.' });
    }

    admin.password = await bcrypt.hash(temporaryPassword, 10);
    admin.mustChangePassword = true;
    await admin.save();
    return res.json({ message: 'Area Admin temporary password reset successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to reset Area Admin password.' });
  }
};

module.exports = {
  getPendingProperties,
  getAdminProperties,
  verifyProperty,
  rejectProperty,
  getAllUsers,
  getUserPermissionDetails,
  updateUserPermissions,
  approveUser,
  createAreaAdmin,
  getStats,
  getAnalytics,
  getAdminPaymentPeriods,
  deleteUser,
  changeUserRole,
  createAdminAccount,
  updateAreaAdminAccount,
  deleteAreaAdminAccount,
  setAreaAdminActive,
  setUserActive,
  resetAreaAdminPassword,
};