const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const RentalRequest = require('../models/RentalRequest');
const Payment = require('../models/Payment');
const User = require('../models/User');
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
const { createSystemLog } = require('./systemLogController');

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

const normalizeAdminAreas = (areas) => {
  if (!Array.isArray(areas)) return null;

  const normalizedAreas = areas
    .map((area) => normalizeAdminAreaObject(area))
    .filter(Boolean);

  return normalizedAreas.length > 0 ? normalizedAreas : null;
};

const createAdminAccount = async (req, res) => {
  try {
    const { name, email, username, phone, password, adminType = 'area', adminAreas = [] } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const requestedArea = String(req.body.assignedArea || '').trim() || getAreaName(adminAreas[0]);

    if (!normalizedName || !normalizedEmail || !normalizedUsername || !password) {
      return res.status(400).json({ message: 'Name, email, username and password are required' });
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
      return res.status(400).json({ message: 'Username must be 3-30 characters and use letters, numbers, periods, underscores, or hyphens.' });
    }
    if (!['platform', 'area'].includes(adminType)) {
      return res.status(400).json({ message: 'Admin type must be platform or area' });
    }
    if (normalizedPhone && !/^(?:\+2519\d{8}|09\d{8})$/.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Use +2519XXXXXXXX or 09XXXXXXXX for the phone number.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    let areaRecord = null;
    if (adminType === 'area') {
      if (!requestedArea) return res.status(400).json({ message: 'An assigned area is required for an area admin.' });
      areaRecord = await Area.findOne({ normalizedName: requestedArea.toLowerCase() }).select('name').lean();
      if (!areaRecord) return res.status(400).json({ message: 'Select an existing area.' });
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
      password: await bcrypt.hash(String(password), 10),
      role: 'admin',
      adminType,
      assignedArea: adminType === 'area' ? areaRecord.name : '',
      adminAreas: adminType === 'area' ? [{ city: areaRecord.name }] : [],
    });

    const safeAdmin = admin.toObject();
    delete safeAdmin.password;
    res.status(201).json({ message: 'Admin account created successfully', user: safeAdmin });
  } catch (error) {
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
      .populate('landlord', 'name email phone profilePhoto role');

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
    let filter = status === 'all'
      ? {}
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

    res.json(properties.map(sanitizeAdminProperty));
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

    const admin = await User.findById(req.user.id).select('adminType adminAreas').lean();
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

    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: 'PROPERTY_VERIFIED',
      description: `Admin verified property "${property.title}".`,
      property: property._id,
      status: 'success',
      ipAddress: req.ip || '',
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

    const admin = await User.findById(req.user.id).select('adminType adminAreas').lean();
    if (!admin || admin.adminType !== 'area') {
      return res.status(403).json({ message: 'Platform Admins are read-only and cannot reject properties.' });
    }

    const adminAreas = await getAdminAreas(req.user.id);
    if (!propertyMatchesAdminAreas(property, adminAreas)) {
      return res.status(403).json({ message: 'This property is outside your assigned admin area' });
    }

    property.isVerified = false;
    property.verificationStatus = 'rejected';
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

    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: 'PROPERTY_REJECTED',
      description: `Admin rejected property "${property.title}". ${comment || 'Documentation insufficient.'}`,
      property: property._id,
      status: 'success',
      ipAddress: req.ip || '',
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
    const filter = {};
    if (getAdministrativeRole(req.user) === 'area_admin') {
      if (req.user.assignedArea) filter.area = req.user.assignedArea;
      else filter._id = null;
    }
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
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
    
    // እራሱን እንዳይሰርዝ
    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const filter = { _id: id };
    if (getAdministrativeRole(req.user) === 'area_admin') {
      if (req.user.assignedArea) filter.area = req.user.assignedArea;
      else filter._id = null;
    }
    const user = await User.findOne(filter);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts must be managed through Admin Management.' });
    }

    if (user.role === 'landlord') {
      const properties = await Property.find({ landlord: user._id }).select('_id');
      const propertyIds = properties.map(property => property._id);
      await VerificationRequest.deleteMany({ property: { $in: propertyIds } });
      await Property.deleteMany({ landlord: user._id });
    }

    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// የተጠቃሚ ሚና መቀየር (Admin ብቻ)
const changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, adminAreas, adminType } = req.body;

    if (!['tenant', 'landlord', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Unknown role' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    if (role === 'admin' && adminAreas !== undefined) {
      const normalizedAreas = normalizeAdminAreas(adminAreas);
      if (!normalizedAreas) {
        return res.status(400).json({ message: 'adminAreas must be an array of area objects' });
      }
      user.adminAreas = normalizedAreas;
      user.adminType = adminType || (normalizedAreas.length > 0 ? 'area' : 'platform');
      if (user.adminType === 'area') {
        const requestedArea = String(req.body.assignedArea || '').trim() || getAreaName(normalizedAreas[0]);
        const area = requestedArea
          ? await Area.findOne({ normalizedName: requestedArea.toLowerCase() }).select('name').lean()
          : null;
        if (!area) return res.status(400).json({ message: 'Select an existing area for an area admin.' });
        user.assignedArea = area.name;
        user.adminAreas = [{ city: area.name }];
      } else {
        user.assignedArea = '';
      }
    } else if (role === 'admin' && adminType !== undefined) {
      if (!['platform', 'area'].includes(adminType)) {
        return res.status(400).json({ message: 'Admin type must be platform or area' });
      }
      user.adminType = adminType;
      if (adminType === 'platform') user.assignedArea = '';
    } else if (role !== 'admin') {
      user.adminAreas = [];
      user.adminType = undefined;
      user.assignedArea = '';
    }
    await user.save();

    const safeUser = user.toObject();
    delete safeUser.password;
    res.json({ message: 'Role changed successfully', user: safeUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const updateAreaAdminAccount = async (req, res) => {
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

    const admin = await User.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: 'Area Admin not found' });
    if (admin.role !== 'admin' || admin.adminType !== 'area') {
      return res.status(403).json({ message: 'Only Area Admin accounts can be edited here' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: admin._id } });
    if (existingUser) return res.status(409).json({ message: 'A user with this email already exists' });

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
    res.status(500).json({ message: 'Unable to update Area Admin' });
  }
};

const deleteAreaAdminAccount = async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(403).json({ message: 'The Platform Admin cannot be deleted here' });
    }

    const admin = await User.findById(req.params.id).select('name email role adminType');
    if (!admin) return res.status(404).json({ message: 'Area Admin not found' });
    if (admin.role !== 'admin' || admin.adminType !== 'area') {
      return res.status(403).json({ message: 'Only Area Admin accounts can be deleted here' });
    }

    await User.deleteOne({ _id: admin._id });
    res.json({ message: 'Area Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to delete Area Admin' });
  }
};

module.exports = {
  getPendingProperties,
  getAdminProperties,
  verifyProperty,
  rejectProperty,
  getAllUsers,
  getStats,
  getAnalytics,
  getAdminPaymentPeriods,
  deleteUser,
  changeUserRole,
  createAdminAccount,
  updateAreaAdminAccount,
  deleteAreaAdminAccount,
};