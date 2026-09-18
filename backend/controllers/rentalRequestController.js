const mongoose = require('mongoose');
const RentRequest = require('../models/RentalRequest');
const Property = require('../models/Property');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { isApprovedProperty } = require('../utils/propertyVerification');
const { createSystemLog } = require('./systemLogController');
const { normalizeAdminAreaObject, propertyMatchesAdminAreas, buildAdminAreaQuery } = require('../utils/adminArea');

const getAreaAdminAreas = async (adminId) => {
  const admin = await User.findById(adminId).select('role adminType adminAreas').lean();
  if (!admin || admin.role !== 'admin' || admin.adminType !== 'area') return null;
  return (admin.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
};

const activateRentalRelationship = async (propertyId, tenantId) => {
  return Property.findOneAndUpdate(
    { _id: propertyId, availabilityStatus: { $ne: 'rented' }, rentedBy: null },
    {
      availabilityStatus: 'rented',
      rentedBy: tenantId,
      rentedAt: new Date(),
    },
    { new: true },
  );
};

const getAdminRentalRequests = async (req, res) => {
  try {
    const admin = await User.findById(req.user.id).select('role adminType adminAreas').lean();
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Admin permission required.' });
    }

    let propertyFilter = {};
    if (admin.adminType === 'area') {
      const adminAreas = (admin.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
      if (adminAreas.length === 0) return res.json([]);
      propertyFilter = buildAdminAreaQuery(adminAreas);
    } else if (admin.adminType !== 'platform') {
      return res.status(403).json({ message: 'Admin permission required.' });
    }

    const properties = Object.keys(propertyFilter).length === 0
      ? await Property.find().select('_id').lean()
      : await Property.find(propertyFilter).select('_id').lean();
    const propertyIds = properties
      .map(property => property._id)
      .filter(propertyId => mongoose.isValidObjectId(propertyId));
    if (propertyIds.length === 0) return res.json([]);

    const requests = await RentRequest.find({ property: { $in: propertyIds } })
      .populate('property', 'title location region zone wereda city subCity kebele houseNumber images image')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching admin rental requests:', error);
    res.status(500).json({ message: 'Unable to load rental requests' });
  }
};

const adminRespondToRentalRequest = async (req, res) => {
  try {
    const { status, message } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }

    const adminAreas = await getAreaAdminAreas(req.user.id);
    if (!adminAreas || adminAreas.length === 0) {
      return res.status(403).json({ message: 'Area Admin permission required.' });
    }

    const request = await RentRequest.findById(req.params.id)
      .populate('property', 'title location region zone wereda city subCity kebele houseNumber')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone');
    if (!request) return res.status(404).json({ message: 'Rental request not found' });
    if (!request.property) return res.status(404).json({ message: 'Property for rental request not found' });

    if (!propertyMatchesAdminAreas(request.property, adminAreas)) {
      return res.status(403).json({ message: 'This rental request is outside your assigned admin area' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'This rental request has already been answered' });
    }

    if (status === 'approved') {
      if (request.property.availabilityStatus === 'rented' || request.property.rentedBy) {
        return res.status(409).json({ message: 'This property is already rented' });
      }

      const existingActiveRental = await RentRequest.exists({
        _id: { $ne: request._id },
        property: request.property._id,
        status: { $in: ['approved', 'confirmed'] },
      });
      if (existingActiveRental) {
        const existingRequest = await RentRequest.findOne({
          _id: { $ne: request._id },
          property: request.property._id,
          status: { $in: ['approved', 'confirmed'] },
        }).select('tenant').lean();
        if (existingRequest?.tenant) {
          await activateRentalRelationship(request.property._id, existingRequest.tenant);
        }
        return res.status(409).json({ message: 'This property already has an active rental request' });
      }
    }

    request.status = status;
    request.adminComment = message || '';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await request.save();

    if (status === 'approved') {
      await activateRentalRelationship(request.property._id, request.tenant._id);
    }

    const propertyTitle = request.property?.title || 'the property';
    const notificationType = status === 'approved' ? 'approved' : 'rejected';
    const notificationMessage = status === 'approved'
      ? `Your rental request for "${propertyTitle}" was approved by the Area Admin.`
      : `Your rental request for "${propertyTitle}" was rejected by the Area Admin.`;
    const notification = {
      property: request.property._id,
      rentalRequest: request._id,
      propertyTitle,
      message: notificationMessage,
      type: notificationType,
      instructions: status === 'approved' ? 'Contact the landlord to confirm the rental.' : 'You can search for another property.',
      read: false,
    };
    await Notification.create({ ...notification, tenant: request.tenant._id, recipientRole: 'tenant' });
    await Notification.create({
      ...notification,
      landlord: request.landlord._id,
      recipientRole: 'landlord',
      message: `The rental request for "${propertyTitle}" was ${status} by the Area Admin.`,
    });
    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: status === 'approved' ? 'RENTAL_REQUEST_APPROVED' : 'RENTAL_REQUEST_REJECTED',
      description: `Area Admin ${status} rental request for property "${propertyTitle}".`,
      property: request.property._id,
      rentalRequest: request._id,
      status: 'success',
      ipAddress: req.ip || '',
    });

    res.json({ message: `Rental request ${status}`, request });
  } catch (error) {
    console.error('Error responding to admin rental request:', error);
    res.status(500).json({ message: 'Unable to update rental request' });
  }
};

// ===== አዲስ የኪራይ ጥያቄ መፍጠር (Tenant ብቻ) =====
const createRentRequest = async (req, res) => {
  try {
    const {
      propertyId,
      fullName,
      email,
      phone,
      message,
      moveInDate,
      occupation,
      numberOfPeople,
      additionalNotes,
    } = req.body;
    
    const tenantId = req.user.id;

    if (!moveInDate) {
      return res.status(400).json({ message: 'Move-in date is required' });
    }

    if (!mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }

    // ንብረቱን ያግኙ
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // ንብረቱ የተረጋገጠ መሆኑን ያረጋግጡ
    if (!isApprovedProperty(property)) {
      return res.status(400).json({ message: 'This property has not been verified yet' });
    }

    // ተከራዩን ያግኙ
    const tenant = await User.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ቀድሞ ጥያቄ መኖሩን ያረጋግጡ
    const existingRequest = await RentRequest.findOne({
      property: propertyId,
      tenant: tenantId,
      status: { $in: ['pending', 'approved', 'confirmed'] }
    });

    if (existingRequest) {
      return res.status(400).json({ 
        message: 'You have already submitted a request for this property'
      });
    }

    if (property.availabilityStatus === 'rented') {
      return res.status(400).json({ message: 'This property is already rented' });
    }

    // አዲስ ጥያቄ ይፍጠሩ
    const rentRequest = new RentRequest({
      property: propertyId,
      tenant: tenantId,
      landlord: property.landlord,
      tenantName: fullName || tenant.name,
      tenantEmail: email || tenant.email,
      tenantPhone: phone || tenant.phone || '',
      message: message || `${tenant.name} is interested in renting this property`,
      moveInDate: moveInDate || null,
      occupation: occupation || '',
      numberOfPeople: numberOfPeople || 1,
      additionalNotes: additionalNotes || '',
      status: 'pending',
      expiresAt: new Date(+new Date() + 7 * 24 * 60 * 60 * 1000),
    });

    try {
      await rentRequest.save();
      await createSystemLog({
        user: tenantId,
        role: tenant.role,
        action: 'RENTAL_REQUEST_CREATED',
        description: `Tenant ${tenant.name} submitted a rental request for property "${property.title}".`,
        property: propertyId,
        rentalRequest: rentRequest._id,
        status: 'success',
        ipAddress: req.ip || '',
      });
    } catch (saveError) {
      if (saveError.code === 11000) {
        return res.status(409).json({ message: 'You have already submitted a request for this property' });
      }
      throw saveError;
    }

    res.status(201).json({
      message: '✅ Rental request submitted successfully! The landlord will review it',
      rentRequest,
    });
  } catch (error) {
    console.error('Error creating rent request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ===== የተከራዩን ጥያቄዎች ማግኘት (Tenant ብቻ) =====
const getMyRentRequests = async (req, res) => {
  try {
    const requests = await RentRequest.find({ tenant: req.user.id })
      .populate('property', 'title location price images verificationDocument availabilityStatus rentedBy rentedAt')
      .populate('landlord', 'name email phone')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching my rent requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMyRentalRequestById = async (req, res) => {
  try {
    const request = await RentRequest.findOne({ _id: req.params.id, tenant: req.user.id })
      .populate('property', 'title location price images description bedrooms availabilityStatus rentedBy')
      .populate('landlord', 'name email phone');
    if (!request) return res.status(404).json({ message: 'Rental request not found' });
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ጊዜ ያለፉ ጥያቄዎችን ማጽዳት (Cron Job) =====
const cleanExpiredRequests = async (req, res) => {
  try {
    const expiredRequests = await RentRequest.find({
      status: 'pending',
      expiresAt: { $lt: new Date() }
    });
    
    const expiredIds = expiredRequests.map(r => r._id);
    
    await RentRequest.updateMany(
      { _id: { $in: expiredIds } },
      { status: 'expired' }
    );
    
    res.json({
      message: `${expiredIds.length} requests have expired`,
      count: expiredIds.length,
    });
  } catch (error) {
    console.error('Error cleaning expired requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ለLandlord የሚሆኑ ጥያቄዎችን ማግኘት =====
const getLandlordRentRequests = async (req, res) => {
  try {
    const landlordId = req.user.id;
    const { status } = req.query;
    
    let filter = { landlord: landlordId };
    if (status) {
      filter.status = status;
    }

    const requests = await RentRequest.find(filter)
      .populate('property', 'title location price images description bedrooms')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching landlord rent requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== Landlord ምላሽ መስጠት =====
const landlordRespondToRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, message } = req.body;
    const landlordId = req.user.id;

    const request = await RentRequest.findById(id)
      .populate('tenant', 'name email phone');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // ይህ ጥያቄ የዚህ Landlord መሆኑን ያረጋግጡ
    if (request.landlord.toString() !== landlordId) {
      return res.status(403).json({ message: 'This request does not belong to you' });
    }

    // ጥያቄው ቀድሞ መልስ ከተሰጠው አይቀየርም
    if (request.status !== 'pending' && request.status !== 'approved') {
      return res.status(400).json({ message: 'This request has already been answered' });
    }

    request.status = status;
    request.landlordComment = message || '';
    request.updatedAt = Date.now();

    await request.save();

    // ለተከራይ ማሳወቂያ
    let notificationMessage = '';
    let notificationType = '';
    let instructions = '';

    if (status === 'approved') {
      notificationMessage = `🏠 The landlord approved your request for "${request.propertyTitle || 'the property'}"!`;
      notificationType = 'approved';
      instructions = `📞 Contact the landlord and confirm the rental`;
    } else if (status === 'rejected') {
      notificationMessage = `😔 The landlord did not accept your request for "${request.propertyTitle || 'the property'}".`;
      notificationType = 'rejected';
      instructions = `🔍 Search for other properties`;
    }

    if (notificationMessage) {
      const notification = new Notification({
        tenant: request.tenant._id,
        property: request.property,
        rentalRequest: request._id,
        propertyTitle: request.propertyTitle || 'Property',
        message: notificationMessage,
        type: notificationType,
        instructions: instructions,
        read: false,
      });
      await notification.save();
    }

    res.json({
      message: 'Response sent successfully',
      request,
    });
  } catch (error) {
    console.error('Error landlord responding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== የተወሰነ ጥያቄ ሙሉ መረጃ ማግኘት (ለLandlord) =====
const getRentRequestForLandlord = async (req, res) => {
  try {
    const { id } = req.params;
    const landlordId = req.user.id;

    const request = await RentRequest.findById(id)
      .populate('property', 'title location price images description bedrooms landlord')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone')
      .populate({
        path: 'property',
        populate: {
          path: 'landlord',
          select: 'name email phone',
        },
      });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // ይህ ጥያቄ የዚህ Landlord መሆኑን ያረጋግጡ
    if (request.landlord._id.toString() !== landlordId) {
      return res.status(403).json({ message: 'This request does not belong to you' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error fetching rent request for landlord:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== ለLandlord የሚሆኑ ስታቲስቲክስ =====
const getLandlordRentStats = async (req, res) => {
  try {
    const landlordId = req.user.id;

    const total = await RentRequest.countDocuments({ landlord: landlordId });
    const pending = await RentRequest.countDocuments({ 
      landlord: landlordId, 
      status: 'pending' 
    });
    const approved = await RentRequest.countDocuments({ 
      landlord: landlordId, 
      status: 'approved' 
    });
    const rejected = await RentRequest.countDocuments({ 
      landlord: landlordId, 
      status: 'rejected' 
    });
    const expired = await RentRequest.countDocuments({ 
      landlord: landlordId, 
      status: 'expired' 
    });

    res.json({
      total,
      pending,
      approved,
      rejected,
      expired,
    });
  } catch (error) {
    console.error('Error fetching landlord rent stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createRentalRequest: createRentRequest,
  getMyRentalRequests: getMyRentRequests,
  getMyRentalRequestById,
  getLandlordRentalRequests: getLandlordRentRequests,
  createRentRequest,
  getMyRentRequests,
  cleanExpiredRequests,
  getLandlordRentRequests,
  landlordRespondToRequest,
  getRentRequestForLandlord,
  getLandlordRentStats,
  getAdminRentalRequests,
  adminRespondToRentalRequest,
};