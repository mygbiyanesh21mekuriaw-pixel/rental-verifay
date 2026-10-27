const mongoose = require('mongoose');
const { canonicalAreaKey } = require('../utils/canonicalArea');

const AdminHandlingHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['verified', 'rejected', 'returned'],
    required: true,
  },
  byId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  byName: {
    type: String,
    required: true,
    trim: true,
  },
  at: {
    type: Date,
    required: true,
  },
  note: {
    type: String,
    default: '',
    trim: true,
  },
}, { _id: false });

const RentalRequestSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  area: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Area',
    default: null,
  },
  areaKey: {
    type: String,
    default: '',
    trim: true,
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
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  handledByName: { type: String, default: '', trim: true },
  handledByRole: { type: String, enum: ['area_admin'], default: null },
  handledAt: { type: Date, default: null },
  decision: { type: String, enum: ['verified', 'rejected', 'returned'], default: null },
  history: { type: [AdminHandlingHistorySchema], default: [] },
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

RentalRequestSchema.pre('validate', function normalizeRentalAreaKey() {
  if (this.areaKey) this.areaKey = canonicalAreaKey(this.areaKey);
});

module.exports = mongoose.model('RentalRequest', RentalRequestSchema);
