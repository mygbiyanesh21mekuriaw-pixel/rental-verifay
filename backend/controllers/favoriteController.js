const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const Property = require('../models/Property');
const { isApprovedProperty } = require('../utils/propertyVerification');

const validatePropertyId = (propertyId) => {
  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    return false;
  }
  return true;
};

// Toggle favorite status for a property
const toggleFavorite = async (req, res) => {
  try {
    const { propertyId } = req.body;
    const tenantId = req.user.id;

    if (!validatePropertyId(propertyId)) {
      return res.status(400).json({ message: 'A valid property ID is required' });
    }

    const property = await Property.findById(propertyId)
      .select('_id isVerified verificationStatus availabilityStatus');

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const existing = await Favorite.findOne({
      tenant: tenantId,
      property: propertyId,
    });

    if (existing) {
      await Favorite.deleteOne({ _id: existing._id });
      return res.json({ message: 'Removed from favorites', isFavorite: false });
    }

    if (!isApprovedProperty(property)) {
      return res.status(400).json({ message: 'Only verified properties can be favorited' });
    }

    const favorite = new Favorite({
      tenant: tenantId,
      property: propertyId,
    });
    await favorite.save();
    return res.json({ message: 'Added to favorites', isFavorite: true });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This property is already favorited' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all favorites for the authenticated tenant
const getMyFavorites = async (req, res) => {
  try {
    const tenantId = req.user.id;

    const favorites = await Favorite.find({ tenant: tenantId })
      .populate({
        path: 'property',
        select: 'title description location price bedrooms images isVerified verificationStatus availabilityStatus landlord',
        populate: { path: 'landlord', select: 'name email phone profilePhoto role' },
      })
      .sort({ createdAt: -1 });

    // Filter out invalid properties
    const validFavorites = favorites.filter(fav => {
      const property = fav.property;
      return property && 
        property.landlord?.role === 'landlord' &&
        property.isVerified &&
        property.verificationStatus === 'approved' &&
        property.availabilityStatus !== 'rented' &&
        typeof property.title === 'string' && property.title.trim() &&
        typeof property.description === 'string' && property.description.trim() &&
        typeof property.location === 'string' && property.location.trim() &&
        typeof property.price === 'number' && property.price > 0 &&
        typeof property.bedrooms === 'number' && property.bedrooms >= 0;
    });

    res.json(validFavorites.map(fav => fav.property));
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check if a property is favorited by the authenticated tenant
const isFavorited = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const tenantId = req.user.id;

    if (!validatePropertyId(propertyId)) {
      return res.status(400).json({ message: 'A valid property ID is required' });
    }

    const favorite = await Favorite.findOne({
      tenant: tenantId,
      property: propertyId,
    }).select('_id');

    res.json({ isFavorited: !!favorite });
  } catch (error) {
    console.error('Error checking favorite status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  toggleFavorite,
  getMyFavorites,
  isFavorited,
};
