const mongoose = require('mongoose');

const VerificationRequestSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  documentUrl: {
    type: String,
    default: '',
  },
  documentAsset: {
    publicId: { type: String },
    resourceType: { type: String, enum: ['image', 'raw'] },
    format: { type: String },
    deliveryType: { type: String, enum: ['authenticated'] },
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  adminComment: {
    type: String,
    default: '',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('VerificationRequest', VerificationRequestSchema);