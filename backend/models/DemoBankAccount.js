const mongoose = require('mongoose');
const DEMO_BANKS = require('../config/demoBanks');

const isConfiguredDemoAccountNumber = function (accountNumber) {
  const bank = DEMO_BANKS.find((candidate) => candidate.code === this.bankCode);
  return Boolean(
    bank &&
    bank.accountNumberFormat === 'numeric' &&
    /^\d+$/.test(accountNumber) &&
    accountNumber.length === bank.accountNumberLength &&
    accountNumber.startsWith(bank.accountNumberPrefix || '')
  );
};

const DemoBankAccountSchema = new mongoose.Schema({
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  bankName: { type: String, required: true, trim: true },
  bankCode: { type: String, required: true, trim: true },
  accountName: { type: String, required: true, trim: true },
  accountNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: isConfiguredDemoAccountNumber,
      message: 'Demo account number must match the selected bank numeric format and length.',
    },
  },
  balance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  credits: [{
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['ETB'], default: 'ETB' },
    creditedAt: { type: Date, required: true },
  }],
}, { timestamps: true });

module.exports = mongoose.model('DemoBankAccount', DemoBankAccountSchema);
