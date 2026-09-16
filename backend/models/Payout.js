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
  paymentReference: { type: String, required: true, trim: true },
  payoutReference: { type: String, required: true, unique: true, trim: true },
  providerReference: { type: String, trim: true, unique: true, sparse: true },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REVERTED'],
    default: 'PENDING',
  },
  failureReason: { type: String, trim: true, default: '' },
}, { timestamps: true });

PayoutSchema.index({ landlord: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', PayoutSchema);
