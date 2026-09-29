const mongoose = require('mongoose');
const Property = require('../models/Property');
const RentRequest = require('../models/RentalRequest');
const Review = require('../models/Review');

const isCurrentTenant = async (propertyId, tenantId) => {
  const property = await Property.findOne({
    _id: propertyId,
    availabilityStatus: 'rented',
    rentedBy: tenantId,
    isVerified: true,
    verificationStatus: 'approved',
  }).select('_id landlord');

  if (!property) return null;

  const rentalRequest = await RentRequest.exists({
    property: property._id,
    tenant: tenantId,
    status: { $in: ['approved', 'confirmed'] },
  });

  return rentalRequest ? property : null;
};

const getPropertyReviews = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.propertyId)) {
      return res.status(400).json({ message: 'Invalid property ID.' });
    }

    const property = await Property.findOne({
      _id: req.params.propertyId,
      isVerified: true,
      verificationStatus: 'approved',
    }).select('_id');
    if (!property) return res.status(404).json({ message: 'Property not found.' });

    const reviews = await Review.find({ property: property._id })
      .populate('tenant', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json(reviews);
  } catch (error) {
    console.error('Error fetching property reviews:', error);
    res.status(500).json({ message: 'Unable to load property reviews.' });
  }
};

const getMyPropertyReview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.propertyId)) {
      return res.status(400).json({ message: 'Invalid property ID.' });
    }

    const property = await isCurrentTenant(req.params.propertyId, req.user.id);
    if (!property) {
      return res.status(403).json({ message: 'Reviews are available only to the current tenant.' });
    }

    const review = await Review.findOne({ property: property._id, tenant: req.user.id }).lean();
    res.json({ review });
  } catch (error) {
    console.error('Error fetching tenant review:', error);
    res.status(500).json({ message: 'Unable to load your review.' });
  }
};

const createReview = async (req, res) => {
  try {
    const { propertyId, rating, comment } = req.body;
    if (!mongoose.isValidObjectId(propertyId)) {
      return res.status(400).json({ message: 'A valid property is required.' });
    }

    const numericRating = Number(rating);
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5 stars.' });
    }
    if (!trimmedComment || trimmedComment.length > 2000) {
      return res.status(400).json({ message: 'Review text is required and must be at most 2000 characters.' });
    }

    const property = await isCurrentTenant(propertyId, req.user.id);
    if (!property) {
      return res.status(403).json({ message: 'Only the current tenant can review this rented property.' });
    }

    const review = await Review.create({
      property: property._id,
      landlord: property.landlord,
      tenant: req.user.id,
      rating: numericRating,
      comment: trimmedComment,
    });

    const populatedReview = await Review.findById(review._id).populate('tenant', 'name').lean();
    res.status(201).json({ message: 'Review submitted successfully.', review: populatedReview });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'You have already reviewed this property.' });
    }
    console.error('Error creating review:', error);
    res.status(500).json({ message: 'Unable to submit your review.' });
  }
};

const getLandlordReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ landlord: req.user.id })
      .populate('tenant', 'name')
      .populate('property', 'title')
      .sort({ createdAt: -1 })
      .lean();

    res.json(reviews);
  } catch (error) {
    console.error('Error fetching landlord reviews:', error);
    res.status(500).json({ message: 'Unable to load tenant reviews.' });
  }
};

module.exports = { getPropertyReviews, getMyPropertyReview, createReview, getLandlordReviews };
