const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const RentalRequest = require('../models/RentalRequest');
const User = require('../models/User');
const { isApprovedProperty } = require('../utils/propertyVerification');
const { createLandlordNotification } = require('./notificationController');
const { createSystemLog } = require('./systemLogController');

const buildMonthLabel = (monthKey) => {
  if (!monthKey) return 'N/A';
  const [year, month] = String(monthKey).split('-');
  if (!year || !month) return monthKey;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
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
      label: key === 'month' ? buildMonthLabel(entry.key) : entry.key,
      value: entry.count,
    }))
    .sort((left, right) => (left.label || '').localeCompare(right.label || ''));
};

const adminAreaFields = ['region', 'zone', 'wereda', 'city', 'subCity'];
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getAdminAreas = async (adminId) => {
  const admin = await User.findById(adminId).select('adminAreas').lean();
  return (admin?.adminAreas || []).filter((area) =>
    adminAreaFields.some((field) => String(area?.[field] || '').trim())
  );
};

const buildAdminAreaQuery = (areas) => ({
  $or: areas.map((area) => ({
    $and: adminAreaFields
      .filter((field) => String(area?.[field] || '').trim())
      .map((field) => ({
        [field]: new RegExp(`^${escapeRegex(String(area[field]).trim())}$`, 'i'),
      })),
  })),
});

const applyAdminAreaScope = async (adminId, filter = {}) => {
  const areas = await getAdminAreas(adminId);
  if (areas.length === 0) return filter;

  return {
    ...filter,
    $and: [
      ...(filter.$and || []),
      buildAdminAreaQuery(areas),
    ],
  };
};

const propertyMatchesAdminAreas = (property, areas) => {
  if (areas.length === 0) return true;
  return areas.some((area) => adminAreaFields
    .filter((field) => String(area?.[field] || '').trim())
    .every((field) => String(property[field] || '').trim().toLowerCase() === String(area[field]).trim().toLowerCase()));
};

const normalizeAdminAreas = (areas) => {
  if (!Array.isArray(areas)) return null;

  return areas
    .filter((area) => area && typeof area === 'object')
    .map((area) => Object.fromEntries(
      adminAreaFields.map((field) => [field, String(area[field] || '').trim()])
    ))
    .filter((area) => adminAreaFields.some((field) => area[field]));
};

const adminRegionValues = new Set(['Addis Ababa', 'amhara', 'oromiya']);

const normalizeAreaAdminFields = (adminAreas) => {
  const normalizedAreas = normalizeAdminAreas(adminAreas);
  if (!normalizedAreas || normalizedAreas.length !== 1) return null;

  const [area] = normalizedAreas;
  if (!area.region || !adminRegionValues.has(area.region)
    || adminAreaFields.some((field) => field !== 'region' && area[field])) {
    return null;
  }

  return [{ region: area.region }];
};

const createAdminAccount = async (req, res) => {
  try {
    const { name, email, phone, password, adminType = 'area', adminAreas = [] } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (!['platform', 'area'].includes(adminType)) {
      return res.status(400).json({ message: 'Admin type must be platform or area' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedAreas = normalizeAdminAreas(adminAreas);
    if (adminType === 'area' && (!normalizedAreas || normalizedAreas.length === 0)) {
      return res.status(400).json({ message: 'At least one assigned area is required for an area admin' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const admin = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      phone: String(phone || '').trim(),
      password: await bcrypt.hash(String(password), 10),
      role: 'admin',
      adminType,
      adminAreas: adminType === 'area' ? normalizedAreas : [],
    });

    const safeAdmin = admin.toObject();
    delete safeAdmin.password;
    res.status(201).json({ message: 'Admin account created successfully', user: safeAdmin });
  } catch (error) {
    res.status(500).json({ message: 'Unable to create admin account' });
  }
};

const getAdminAnalyticsSnapshot = async () => {
  const [
    totalUsers,
    totalTenants,
    totalLandlords,
    totalAdmins,
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
    userRoleData,
    rentalRequestStatusData,
    propertyTrendData,
    userTrendData,
    rentalRequestTrendData,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'tenant' }),
    User.countDocuments({ role: 'landlord' }),
    User.countDocuments({ role: 'admin' }),
    Property.countDocuments(),
    Property.countDocuments({ isVerified: true, verificationStatus: 'approved' }),
    Property.countDocuments({ verificationStatus: 'pending' }),
    Property.countDocuments({ verificationStatus: 'rejected' }),
    Property.countDocuments({ availabilityStatus: 'available' }),
    Property.countDocuments({ availabilityStatus: 'rented' }),
    RentalRequest.countDocuments(),
    RentalRequest.countDocuments({ status: 'pending' }),
    RentalRequest.countDocuments({ status: 'approved' }),
    RentalRequest.countDocuments({ status: 'rejected' }),
    Property.aggregate([
      { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    RentalRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Property.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    RentalRequest.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
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

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalUsers,
      totalTenants,
      totalLandlords,
      totalAdmins,
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
    },
    propertyStatus: {
      verified: propertyStatus.verified,
      pending: propertyStatus.pending,
      rejected: propertyStatus.rejected,
      available: propertyStatus.available,
      rented: propertyStatus.rented,
      breakdown: propertyBuckets,
    },
    userRoles: {
      total: totalUsers,
      tenants: totalTenants,
      landlords: totalLandlords,
      admins: totalAdmins,
      breakdown: userBuckets,
    },
    rentalRequestStatus: {
      pending: pendingRentalRequests,
      approved: approvedRentalRequests,
      rejected: rejectedRentalRequests,
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

    res.json(pendingProperties);
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

    res.json(properties);
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

    res.json({ message: 'Property verified successfully', property });
  } catch (error) {
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

    res.json({ message: 'Property rejected', property });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ሁሉንም ተጠቃሚዎች ማግኘት (Admin ብቻ)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
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
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// አዲስ አድሚን አናሊቲክስ ማስላት
const getAnalytics = async (req, res) => {
  try {
    const analytics = await getAdminAnalyticsSnapshot();
    res.json(analytics);
  } catch (error) {
    console.error('Analytics fetch failed:', error);
    res.status(500).json({ message: 'Unable to load admin analytics', error: error.message });
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

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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
    } else if (role === 'admin' && adminType !== undefined) {
      if (!['platform', 'area'].includes(adminType)) {
        return res.status(400).json({ message: 'Admin type must be platform or area' });
      }
      user.adminType = adminType;
    } else if (role !== 'admin') {
      user.adminAreas = [];
      user.adminType = undefined;
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
    const { name, email, phone, adminAreas } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedAreas = normalizeAreaAdminFields(adminAreas);

    if (!normalizedName || !normalizedEmail || !normalizedAreas) {
      return res.status(400).json({ message: 'Name, email and one valid assigned area are required' });
    }

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
      phone: String(phone || '').trim(),
      role: 'admin',
      adminType: 'area',
      adminAreas: normalizedAreas,
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
  deleteUser,
  changeUserRole,
  createAdminAccount,
  updateAreaAdminAccount,
  deleteAreaAdminAccount,
};