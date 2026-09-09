const mongoose = require('mongoose');
const RentRequest = require('../models/RentalRequest');
const Property = require('../models/Property');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { isApprovedProperty } = require('../utils/propertyVerification');
const { createSystemLog } = require('./systemLogController');

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
      message: '✅ Rental request submitted successfully! An admin will review it',
      rentRequest,
    });
  } catch (error) {
    console.error('Error creating rent request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ===== ሁሉንም የኪራይ ጥያቄዎች ማግኘት (Admin ብቻ) =====
const getAllRentRequests = async (req, res) => {
  try {
    const { status } = req.query;
    
    let filter = {};
    if (status) {
      filter.status = status;
    }

    const requests = await RentRequest.find(filter)
      .populate('property', 'title location address price images availabilityStatus bedrooms')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching rent requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== የተወሰነ ጥያቄ ማግኘት =====
const getRentRequestById = async (req, res) => {
  try {
    const request = await RentRequest.findById(req.params.id)
      .populate('property', 'title location price images description address bedrooms rooms availabilityStatus')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.json(request);
  } catch (error) {
    console.error('Error fetching rent request:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== የኪራይ ጥያቄ ሁኔታ ማዘመን (Admin ብቻ) =====
const updateRentRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;
    const approvedStatus = status === 'approved' || status === 'confirmed';

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid rental request ID' });
    }

    const request = await RentRequest.findById(id)
      .populate('property', 'title location price images availabilityStatus')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // ጊዜ ካለፈ አይቀየርም
    if (request.expiresAt && new Date() > request.expiresAt && request.status === 'pending') {
      request.status = 'expired';
      await request.save();
      return res.status(400).json({ 
        message: 'This request has expired',
        request 
      });
    }

    if (!['approved', 'confirmed', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ message: 'Only pending requests can be reviewed' });
    }
    if (!request.tenant || !request.property) {
      return res.status(409).json({ message: 'Rental request references missing user or property data' });
    }

    request.tenantName = request.tenantName || request.tenant.name;
    request.tenantEmail = request.tenantEmail || request.tenant.email;
    request.tenantPhone = request.tenantPhone || request.tenant.phone || '';

    request.status = approvedStatus ? 'approved' : 'rejected';
    if (adminComment) {
      request.adminComment = adminComment;
    }
    request.reviewedBy = req.user.id;
    request.reviewedAt = Date.now();
    request.updatedAt = Date.now();

    // ===== ለተከራይ ማሳወቂያ =====
    let notificationMessage = '';
    let notificationType = '';
    let instructions = '';

    if (approvedStatus) {
      const property = await Property.findOneAndUpdate(
        {
          _id: request.property._id,
          isVerified: true,
          verificationStatus: 'approved',
          availabilityStatus: { $in: ['available', null] },
        },
        {
          availabilityStatus: 'rented',
          rentedBy: request.tenant._id,
          rentedAt: new Date(),
        },
        { new: true }
      );
      if (!property) {
        return res.status(409).json({ message: 'This property has already been rented' });
      }
      notificationMessage = `Your rental request for "${request.property.title}" has been approved by the administrator.`;
      notificationType = 'approved';
      instructions = `
📋 Rental instructions:
1. 📞 Contact the landlord: ${request.landlord?.phone || 'No phone available'}
2. 📧 Email: ${request.landlord?.email || 'No email available'}
3. 📅 Confirm your move-in date
4. 📝 Sign the rental agreement
5. 💰 Make the initial payment
      `;
    } else if (status === 'rejected') {
      notificationMessage = `Your rental request for "${request.property.title}" was rejected by the administrator.`;
      notificationType = 'rejected';
      instructions = `
💡 Other options:
1. 🔍 Search for other properties
2. 📝 Submit a new request
3. 📞 Contact us for more help
      `;
    }

    await request.save();

    // ===== ማሳወቂያ ወደ Notification Model ማስቀመጥ =====
    if (notificationMessage) {
      const notification = new Notification({
        tenant: request.tenant._id,
        property: request.property._id,
        rentalRequest: request._id,
        propertyTitle: request.property.title,
        message: notificationMessage,
        type: notificationType,
        instructions: instructions,
        read: false,
      });
      await notification.save();
    }

    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: approvedStatus ? 'RENTAL_REQUEST_APPROVED' : 'RENTAL_REQUEST_REJECTED',
      description: approvedStatus
        ? `Admin approved rental request for property "${request.property.title}".`
        : `Admin rejected rental request for property "${request.property.title}".`,
      property: request.property._id,
      rentalRequest: request._id,
      status: 'success',
      ipAddress: req.ip || '',
    });

    res.json({
      message: `Rental request status changed to "${status}"`,
      notification: {
        message: notificationMessage,
        type: notificationType,
        instructions: instructions,
        propertyTitle: request.property.title,
        landlord: {
          name: request.landlord?.name,
          phone: request.landlord?.phone,
          email: request.landlord?.email,
        },
      },
      request,
    });
  } catch (error) {
    console.error('Error updating rent request:', error);
    res.status(500).json({ message: 'Server error' });
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
  getRentalRequests: getAllRentRequests,
  getMyRentalRequests: getMyRentRequests,
  getMyRentalRequestById,
  getLandlordRentalRequests: getLandlordRentRequests,
  updateRentalRequestStatus: updateRentRequestStatus,
  createRentRequest,
  getAllRentRequests,
  getRentRequestById,
  updateRentRequestStatus,
  getMyRentRequests,
  cleanExpiredRequests,
  getLandlordRentRequests,
  landlordRespondToRequest,
  getRentRequestForLandlord,
  getLandlordRentStats,
};