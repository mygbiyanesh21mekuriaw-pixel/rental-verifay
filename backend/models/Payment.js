const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
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
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    enum: ['ETB'],
    default: 'ETB',
  },
  paymentPeriod: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending',
  },
  paymentReference: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  provider: {
    type: String,
    trim: true,
  },
  providerReference: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
  },
  providerPaymentId: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
  },
  checkoutUrl: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

PaymentSchema.index({ tenant: 1, property: 1, paymentPeriod: 1 }, { unique: true });
PaymentSchema.index({ landlord: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', PaymentSchema);
