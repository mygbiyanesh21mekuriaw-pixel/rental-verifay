const mongoose = require('mongoose');

const ViewHistorySchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  viewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  viewedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

ViewHistorySchema.index({ viewer: 1, viewedAt: -1 });

module.exports = mongoose.model('ViewHistory', ViewHistorySchema);
