const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  actorName: { type: String, default: '' },
  actorEmail: { type: String, default: '' },
  role: {
    type: String,
    enum: ['admin', 'platform_admin', 'area_admin', 'landlord', 'tenant', 'user'],
    default: null,
  },
  action: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    default: null,
  },
  rentalRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RentalRequest',
    default: null,
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null,
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending', 'denied'],
    default: 'success',
  },
  module: { type: String, default: '' },
  targetType: { type: String, default: '' },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  targetLabel: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  ipAddress: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

SystemLogSchema.index({ createdAt: -1 });
SystemLogSchema.index({ action: 1, createdAt: -1 });
SystemLogSchema.index({ role: 1, createdAt: -1 });
SystemLogSchema.index({ status: 1, createdAt: -1 });
SystemLogSchema.index({ user: 1, createdAt: -1 });
SystemLogSchema.index({ module: 1, createdAt: -1 });

module.exports = mongoose.model('SystemLog', SystemLogSchema);
