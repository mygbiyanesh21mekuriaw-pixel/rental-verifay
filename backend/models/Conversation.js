const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  body: { type: String, required: true, trim: true },
  sentAt: { type: Date, default: Date.now },
});

const ConversationSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  messages: [MessageSchema],
}, { timestamps: true });

ConversationSchema.index({ tenant: 1, landlord: 1, property: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', ConversationSchema);
