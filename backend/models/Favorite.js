const mongoose = require('mongoose');

const FavoriteSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Ensure unique tenant-property combination
FavoriteSchema.index({ tenant: 1, property: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', FavoriteSchema);
