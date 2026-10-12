const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global',
    enum: ['global'],
  },
  defaultLanguage: {
    type: String,
    enum: ['en', 'am', 'om', 'ti', 'sid'],
    default: 'en',
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
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
