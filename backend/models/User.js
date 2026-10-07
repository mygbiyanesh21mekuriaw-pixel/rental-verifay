const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  passwordResetTokenHash: {
    type: String,
    default: undefined,
    select: false,
  },
  passwordResetExpiresAt: {
    type: Date,
    default: undefined,
    select: false,
  },
  phone: {
    type: String,
    default: '',
  },
  profilePhoto: {
    type: String,
    default: '',
  },
  bankAccountName: { type: String, default: '', trim: true },
  bankAccountNumber: { type: String, default: '', trim: true, select: false },
  bankCode: { type: String, default: '', trim: true },
  bankName: { type: String, default: '', trim: true },
  bankAccountSource: { type: String, enum: ['', 'bank_api', 'existing_account', 'demo'], default: '' },
  bankAccountConfigured: { type: Boolean, default: undefined },
  bankAccountVerified: { type: Boolean, default: false },
  internalBalance: { type: Number, default: 0, min: 0 },
  internalCreditReferences: [{
    _id: false,
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    providerTransactionReference: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    creditedAt: { type: Date, required: true },
  }],
  internalPayoutReferences: [{
    _id: false,
    payoutReference: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['RESERVED', 'EXECUTED', 'REFUNDED'], required: true },
    createdAt: { type: Date, required: true },
  }],
  role: {
    type: String,
    enum: ['user', 'tenant', 'landlord', 'admin'],
    default: 'tenant',
  },
  adminType: {
    type: String,
    enum: ['platform', 'area'],
    default: undefined,
  },
  adminAreas: [{
    region: { type: String, trim: true, default: '' },
    zone: { type: String, trim: true, default: '' },
    wereda: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    subCity: { type: String, trim: true, default: '' },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);