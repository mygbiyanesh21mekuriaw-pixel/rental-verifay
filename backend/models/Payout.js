const mongoose = require('mongoose');

const PayoutSchema = new mongoose.Schema({
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    unique: true,
  },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['ETB'], default: 'ETB' },
  mode: { type: String, enum: ['sandbox', 'live'], required: true },
  paymentReference: { type: String, required: true, trim: true },
  payoutReference: { type: String, required: true, unique: true, trim: true },
  providerReference: { type: String, trim: true, unique: true, sparse: true },
  destinationBankCode: { type: String, trim: true, default: '' },
  destinationBankName: { type: String, trim: true, default: '' },
  destinationBankSlug: { type: String, trim: true, default: '' },
  destinationAccountName: { type: String, trim: true, default: '' },
  destinationAccountNumber: { type: String, trim: true, default: '', select: false },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REVERTED', 'SIMULATED'],
    default: 'PENDING',
  },
  sandboxTransferStatus: {
    type: String,
    enum: ['PROCESSING', 'SUCCEEDED', 'FAILED'],
    default: undefined,
  },
  providerRequestResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  providerVerificationResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  lastVerifiedAt: { type: Date, default: null },
  transferAttemptedAt: { type: Date, default: null },
  failureReason: { type: String, trim: true, default: '' },
}, { timestamps: true });

PayoutSchema.index({ landlord: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', PayoutSchema);
