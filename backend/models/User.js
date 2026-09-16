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
  phone: {
    type: String,
    default: '',
  },
  profilePhoto: {
    type: String,
    default: '',
  },
  bankAccountName: { type: String, default: '', trim: true },
  bankAccountNumber: { type: String, default: '', trim: true },
  bankCode: { type: String, default: '', trim: true },
  bankName: { type: String, default: '', trim: true },
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