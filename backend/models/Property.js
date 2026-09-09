const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    trim: true,
    default: '',
  },
  zone: {
    type: String,
    trim: true,
    default: '',
  },
  wereda: {
    type: String,
    trim: true,
    default: '',
  },
  city: {
    type: String,
    trim: true,
    default: '',
  },
  subCity: {
    type: String,
    trim: true,
    default: '',
  },
  zoneWereda: {
    type: String,
    trim: true,
    default: '',
  },
  townSubcity: {
    type: String,
    trim: true,
    default: '',
  },
  kebele: {
    type: String,
    trim: true,
    default: '',
  },
  houseNumber: {
    type: String,
    trim: true,
    default: '',
  },
  latitude: {
    type: Number,
    min: -90,
    max: 90,
    default: null,
  },
  longitude: {
    type: Number,
    min: -180,
    max: 180,
    default: null,
  },
  bedrooms: {
    type: Number,
    required: true,
  },
  images: [{
    type: String, // Cloudinary URLs ይሆናሉ
  }],
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  availabilityStatus: {
    type: String,
    enum: ['available', 'rented'],
    default: 'available',
  },
  rentedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  rentedAt: {
    type: Date,
    default: null,
  },
  verificationDocument: {
    type: String, // የባለቤትነት ማስረጃ (Title Deed) URL
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Property', PropertySchema);