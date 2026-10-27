const mongoose = require('mongoose');
const { canonicalAreaKey, normalizeAreaName } = require('../utils/canonicalArea');

const AdminHandlingHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['verified', 'rejected', 'returned'],
    required: true,
  },
  byId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  byName: {
    type: String,
    required: true,
    trim: true,
  },
  at: {
    type: Date,
    required: true,
  },
  note: {
    type: String,
    default: '',
    trim: true,
  },
}, { _id: false });

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
  area: {
    type: String,
    required: true,
    trim: true,
  },
  areaKey: {
    type: String,
    default: '',
    trim: true,
    index: true,
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
  propertyImages: [{
    type: String,
  }],
  image: {
    type: String,
    default: '',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  handledByName: {
    type: String,
    default: '',
    trim: true,
  },
  handledByRole: {
    type: String,
    enum: ['area_admin'],
    default: null,
  },
  handledAt: {
    type: Date,
    default: null,
  },
  decision: {
    type: String,
    enum: ['verified', 'rejected', 'returned'],
    default: null,
  },
  history: {
    type: [AdminHandlingHistorySchema],
    default: [],
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
  verificationDocumentAsset: {
    publicId: { type: String },
    resourceType: { type: String, enum: ['image', 'raw'] },
    format: { type: String },
    deliveryType: { type: String, enum: ['authenticated'] },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

PropertySchema.pre('validate', function normalizePropertyArea() {
  if (this.area) {
    this.area = normalizeAreaName(this.area);
    this.areaKey = canonicalAreaKey(this.area);
  }
});

module.exports = mongoose.model('Property', PropertySchema);