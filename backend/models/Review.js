const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 2000,
    required: true,
  },
}, { timestamps: true });

ReviewSchema.index({ property: 1, tenant: 1 }, { unique: true });
ReviewSchema.index({ landlord: 1, createdAt: -1 });

module.exports = mongoose.model('Review', ReviewSchema);
