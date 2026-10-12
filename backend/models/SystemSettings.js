const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global',
    enum: ['global'],
  },
  defaultAppearance: {
    type: String,
    enum: ['light', 'dark', 'system'],
    default: 'system',
  },
  notifications: {
    inAppEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
  },
  general: {
    websiteName: { type: String, trim: true, maxlength: 100, default: 'House Rental Management System' },
    websiteLogoDataUri: { type: String, default: '' },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    contactPhone: { type: String, trim: true, maxlength: 30, default: '' },
    contactAddress: { type: String, trim: true, maxlength: 500, default: '' },
  },
  properties: {
    submissionsEnabled: { type: Boolean, default: true },
    requireAdminReview: { type: Boolean, default: true },
  },
  maintenance: {
    enabled: { type: Boolean, default: false },
    message: { type: String, trim: true, maxlength: 500, default: 'RentalVerify is temporarily unavailable for scheduled maintenance. Please check back soon.' },
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
