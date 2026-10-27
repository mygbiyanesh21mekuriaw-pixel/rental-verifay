const mongoose = require('mongoose');
const { canonicalAreaKey, normalizeAreaName } = require('../utils/canonicalArea');

const ContactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  area: { type: String, required: true, trim: true },
  areaKey: { type: String, default: '', trim: true },
  subject: { type: String, required: true, trim: true, maxlength: 180 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  read: { type: Boolean, default: false },
}, { timestamps: true });

ContactMessageSchema.index({ createdAt: -1 });

ContactMessageSchema.pre('validate', function normalizeContactArea() {
  if (this.area) {
    this.area = normalizeAreaName(this.area);
    this.areaKey = canonicalAreaKey(this.area);
  }
});

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
