const mongoose = require('mongoose');

const AreaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  normalizedName: { type: String, required: true, unique: true, lowercase: true, trim: true },
  region: { type: String, trim: true, default: '' },
}, { timestamps: true });

AreaSchema.pre('validate', function normalizeAreaName() {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }
});

module.exports = mongoose.model('Area', AreaSchema);
