const Property = require('../models/Property');
const ViewHistory = require('../models/ViewHistory');
const { isApprovedProperty } = require('../utils/propertyVerification');

const recordPropertyView = async (req, res) => {
  try {
    const property = await Property.findById(req.body.propertyId)
      .select('_id isVerified verificationStatus availabilityStatus landlord')
      .populate('landlord', 'role');

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    if (
      property.landlord?.role !== 'landlord' ||
      !isApprovedProperty(property) ||
      property.availabilityStatus === 'rented'
    ) {
      return res.status(400).json({ message: 'Only available properties can be viewed' });
    }

    const view = await ViewHistory.findOneAndUpdate(
      { property: property._id, viewer: req.user.id },
      { $set: { viewedAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ message: 'Property view recorded', view });
  } catch (error) {
    console.error('View history record error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMyViewHistory = async (req, res) => {
  try {
    const history = await ViewHistory.find({ viewer: req.user.id })
      .populate({
        path: 'property',
        select: 'title description location price bedrooms images isVerified verificationStatus availabilityStatus landlord',
        populate: { path: 'landlord', select: 'role' },
      })
      .sort({ viewedAt: -1 });

    const seenPropertyIds = new Set();
    const validHistory = history.filter((entry) => {
      const property = entry.property;
      const propertyId = property?._id?.toString();
      const isValid = propertyId &&
        !seenPropertyIds.has(propertyId) &&
        property.landlord?.role === 'landlord' &&
        property.isVerified &&
        property.verificationStatus === 'approved' &&
        property.availabilityStatus !== 'rented' &&
        typeof property.title === 'string' && property.title.trim() &&
        typeof property.description === 'string' && property.description.trim() &&
        typeof property.location === 'string' && property.location.trim() &&
        typeof property.price === 'number' && property.price > 0 &&
        typeof property.bedrooms === 'number' && property.bedrooms >= 0;
      if (isValid) seenPropertyIds.add(propertyId);
      return isValid;
    });

    res.json(validHistory);
  } catch (error) {
    console.error('View history fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { recordPropertyView, getMyViewHistory };
