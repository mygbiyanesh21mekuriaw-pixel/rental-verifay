const mongoose = require('mongoose');

const LandlordCreditSchema = new mongoose.Schema({
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['ETB'], default: 'ETB' },
  type: { type: String, enum: ['RENT_PAYMENT_CREDIT'], default: 'RENT_PAYMENT_CREDIT' },
  provider: { type: String, required: true, trim: true },
  paymentMode: { type: String, enum: ['sandbox', 'live'], default: undefined },
  paymentReference: { type: String, required: true, trim: true },
  providerTransactionReference: { type: String, required: true, trim: true },
  bankName: { type: String, trim: true, default: '' },
  bankCode: { type: String, trim: true, default: '' },
  bankAccountName: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['PENDING', 'CREDITED', 'FAILED'], default: 'PENDING' },
  reason: { type: String, trim: true, default: '' },
  creditedAt: { type: Date, default: null },
  externalTransferStatus: {
    type: String,
    enum: ['NOT_EXECUTED', 'PENDING', 'PROCESSING', 'EXECUTED', 'FAILED', 'REVERTED'],
    default: 'NOT_EXECUTED',
  },
  sandboxTransferStatus: {
    type: String,
    enum: ['PROCESSING', 'SUCCEEDED', 'FAILED'],
    default: undefined,
  },
}, { timestamps: true });

LandlordCreditSchema.index({ payment: 1 }, { unique: true });
LandlordCreditSchema.index({ providerTransactionReference: 1 }, { unique: true });
LandlordCreditSchema.index({ landlord: 1, createdAt: -1 });
LandlordCreditSchema.index({ status: 1, paymentMode: 1, externalTransferStatus: 1, createdAt: 1 });

module.exports = mongoose.model('LandlordCredit', LandlordCreditSchema);
