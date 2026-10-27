const mongoose = require('mongoose');
const { canonicalAreaKey, normalizeAreaName } = require('../utils/canonicalArea');

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
  username: {
    type: String,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-z0-9_]+$/,
  },
  password: {
    type: String,
    required: true,
  },
  mustChangePassword: {
    type: Boolean,
    default: false,
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
  area: {
    type: String,
    trim: true,
    default: '',
  },
  assignedArea: {
    type: String,
    trim: true,
    default: '',
  },
  assignedAreaKey: {
    type: String,
    default: '',
    trim: true,
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
  isActive: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended'],
    default: 'active',
    index: true,
  },
  replacedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
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
}, { autoIndex: false });

UserSchema.pre('validate', function normalizeAssignedArea() {
  if (this.assignedArea) {
    this.assignedArea = normalizeAreaName(this.assignedArea);
    this.assignedAreaKey = canonicalAreaKey(this.assignedArea);
  } else {
    this.assignedAreaKey = '';
  }
});

UserSchema.index({ username: 1 }, { unique: true, sparse: true });
UserSchema.index(
  { assignedArea: 1 },
  {
    name: 'one_area_admin_per_area',
    unique: true,
    partialFilterExpression: {
      role: 'admin',
      adminType: 'area',
      assignedArea: { $type: 'string', $gt: '' },
    },
    collation: { locale: 'en', strength: 2 },
  },
);

const removeUserPermissions = async (userId) => {
  await require('./UserPermission').deleteMany({ userId });
};

UserSchema.pre('deleteOne', { document: true, query: false }, async function cascadePermissions() {
  await removeUserPermissions(this._id);
});

UserSchema.pre('deleteOne', { document: false, query: true }, async function cascadeQueryPermissions() {
  const user = await this.model.findOne(this.getFilter()).select('_id').lean();
  if (user) await removeUserPermissions(user._id);
});

UserSchema.pre('findOneAndDelete', async function cascadeFindOnePermissions() {
  const user = await this.model.findOne(this.getFilter()).select('_id').lean();
  if (user) await removeUserPermissions(user._id);
});

UserSchema.pre('deleteMany', async function cascadeManyPermissions() {
  const users = await this.model.find(this.getFilter()).select('_id').lean();
  const userIds = users.map((user) => user._id);
  if (userIds.length > 0) {
    await require('./UserPermission').deleteMany({ userId: { $in: userIds } });
  }
});

module.exports = mongoose.model('User', UserSchema);