const mongoose = require('mongoose');
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
    const pendingProperties = await Property.find({
      verificationStatus: 'pending',
      isVerified: false,
    }).populate('landlord', 'name email phone profilePhoto role');

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
    const filter = status === 'all'
      ? {}
      : status === 'approved'
        ? { verificationStatus: 'approved', isVerified: true }
        : { verificationStatus: status, isVerified: false };
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
    const { role } = req.body;

    if (!['tenant', 'landlord', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Unknown role' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.json({ message: 'Role changed successfully', user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
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
};