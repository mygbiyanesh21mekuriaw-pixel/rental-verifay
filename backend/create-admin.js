require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { ensureUserPermissions } = require('./services/userPermissions');
const { permissionRoleForUser } = require('./config/permissionCatalog');

const PLATFORM_ADMIN_USERNAME = 'platform_admin';
const LEGACY_PLATFORM_ADMIN_USERNAME = 'platform.admin';

const normalizeAdminEmail = (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.replace(/@rentalverifay\.com$/i, '@rentalverify.com');
};

const isPlatformAdmin = (user) => user?.role === 'admin' && (
  user.adminType === 'platform' ||
  (!user.adminType && (!user.adminAreas || user.adminAreas.length === 0))
);

const warnUsernameCollision = (adminEmail) => {
  console.warn(
    `⚠️  Cannot set Platform Admin username to "${PLATFORM_ADMIN_USERNAME}" for ${adminEmail || 'the existing Platform Admin'}: another user already has that username.`
  );
};

const findExistingPlatformAdmin = async (adminEmail) => {
  let occupiedEmail = false;
  if (adminEmail) {
    const accountForEmail = await User.findOne({ email: adminEmail });
    if (isPlatformAdmin(accountForEmail)) return accountForEmail;
    if (accountForEmail) {
      occupiedEmail = true;
      console.warn(`⚠️  Admin bootstrap skipped: ${adminEmail} is not the existing Platform Admin account; its fields were left unchanged.`);
    }
  }

  const platformAdmin = await User.findOne({
    role: 'admin',
    $or: [
      { adminType: 'platform' },
      { adminType: { $exists: false }, adminAreas: { $size: 0 } },
    ],
  });
  return platformAdmin || (occupiedEmail ? false : null);
};

const setCanonicalUsername = async (admin) => {
  const username = typeof admin.username === 'string' ? admin.username.trim().toLowerCase() : '';
  if (username && username !== LEGACY_PLATFORM_ADMIN_USERNAME) return admin;

  const duplicate = await User.findOne({
    username: { $regex: `^${PLATFORM_ADMIN_USERNAME}$`, $options: 'i' },
    _id: { $ne: admin._id },
  }).select('_id');

  if (duplicate) {
    warnUsernameCollision(admin.email);
    return admin;
  }

  try {
    const result = await User.updateOne(
      { _id: admin._id },
      { $set: { username: PLATFORM_ADMIN_USERNAME } },
      { runValidators: true }
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Platform Admin ${admin.email || admin._id} changed while its username was being updated.`);
    }

    admin.username = PLATFORM_ADMIN_USERNAME;
    console.log(`✅ Updated Platform Admin username to ${PLATFORM_ADMIN_USERNAME}.`);
    return admin;
  } catch (error) {
    if (error?.code === 11000) {
      warnUsernameCollision(admin.email);
      return admin;
    }
    throw error;
  }
};

async function createAdmin() {
  try {
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rental-db';
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 15000,
      });
    }

    const adminEmail = normalizeAdminEmail(process.env.ADMIN_EMAIL);
    let admin = await findExistingPlatformAdmin(adminEmail);

    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount > 1) {
      console.warn(`⚠️  Found ${adminCount} admin accounts. Bootstrap will not create or delete any admin accounts.`);
    }

    if (admin === false) return null;
    if (admin) return await setCanonicalUsername(admin);

    const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
    const adminName = String(process.env.ADMIN_NAME || '').trim();
    if (!adminEmail || !adminPassword || !adminName) {
      console.log('ℹ️  Platform admin bootstrap skipped. Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME to create the initial admin.');
      return null;
    }

    const duplicate = await User.findOne({
      username: { $regex: `^${PLATFORM_ADMIN_USERNAME}$`, $options: 'i' },
    }).select('_id');
    if (duplicate) {
      warnUsernameCollision(adminEmail);
      return null;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);
    admin = new User({
      name: adminName,
      email: adminEmail,
      username: PLATFORM_ADMIN_USERNAME,
      password: hashedPassword,
      phone: String(process.env.ADMIN_PHONE || '').trim(),
      role: 'admin',
      adminType: 'platform',
      status: 'active',
      adminAreas: [],
    });

    try {
      await admin.save();
      await ensureUserPermissions(admin._id, permissionRoleForUser(admin));
    } catch (error) {
      if (error?.code === 11000) {
        if (error?.keyPattern?.username) warnUsernameCollision(adminEmail);
        else console.warn(`⚠️  Platform admin ${adminEmail} was created by another process; no second account was added.`);
        return null;
      }
      throw error;
    }

    console.log('✅ Platform admin created successfully!');
    console.log(`📧 Email: ${adminEmail}`);
    return admin;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

if (require.main === module) {
  createAdmin()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createAdmin;
