const mongoose = require('mongoose');

const RentalRequestSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tenantName: {
    type: String,
    required: true,
    trim: true,
  },
  tenantEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  tenantPhone: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'confirmed', 'rejected', 'expired'],
    default: 'pending',
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  moveInDate: {
    type: Date,
    required: true,
  },
  occupation: { type: String, trim: true, default: '' },
  numberOfPeople: { type: Number, min: 1, default: 1 },
  additionalNotes: { type: String, trim: true, default: '' },
  adminComment: { type: String, trim: true, default: '' },
  landlordComment: { type: String, trim: true, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

RentalRequestSchema.index(
  { property: 1, tenant: 1 },
  {
    name: 'active_property_tenant_unique',
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'approved', 'confirmed'] } },
  }
);

module.exports = mongoose.model('RentalRequest', RentalRequestSchema);
