const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  role: {
    type: String,
    enum: ['admin', 'landlord', 'tenant', 'user'],
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
    enum: ['success', 'failed', 'pending'],
    default: 'success',
  },
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

module.exports = mongoose.model('SystemLog', SystemLogSchema);
