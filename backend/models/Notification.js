const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  landlord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  recipientRole: {
    type: String,
    enum: ['tenant', 'landlord', 'admin'],
    default: 'tenant',
    required: true,
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  rentalRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RentalRequest',
  },
  propertyTitle: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['approved', 'rejected', 'pending', 'expired', 'info'],
    default: 'info',
  },
  instructions: {
    type: String,
    default: '',
  },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Notification', NotificationSchema);