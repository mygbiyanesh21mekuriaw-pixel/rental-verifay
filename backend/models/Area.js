const mongoose = require('mongoose');
const {
  canonicalAreaKey,
  normalizeAreaName: normalizeAreaDisplayName,
} = require('../utils/canonicalArea');

const AreaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  normalizedName: { type: String, required: true, unique: true, lowercase: true, trim: true },
  canonicalKey: { type: String, default: '', trim: true, index: true },
  region: { type: String, trim: true, default: '' },
  addressMapping: {
    region: { type: String, trim: true, default: '' },
    zone: { type: String, trim: true, default: '' },
    wereda: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

AreaSchema.pre('validate', function normalizeAreaName() {
  if (this.name) {
    this.name = normalizeAreaDisplayName(this.name);
    this.normalizedName = this.name.toLowerCase();
    this.canonicalKey = canonicalAreaKey(this.name);
  }
});

module.exports = mongoose.model('Area', AreaSchema);
