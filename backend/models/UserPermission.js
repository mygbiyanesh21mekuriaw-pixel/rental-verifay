const mongoose = require('mongoose');

const UserPermissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  permissionKey: {
    type: String,
    required: true,
    trim: true,
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
});

UserPermissionSchema.index(
  { userId: 1, permissionKey: 1 },
  { unique: true, name: 'unique_user_permission' },
);

module.exports = mongoose.model('UserPermission', UserPermissionSchema);