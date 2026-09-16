require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rental-db';
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
    const adminName = String(process.env.ADMIN_NAME || '').trim();

    if (!adminEmail || !adminPassword || !adminName) {
      console.log('ℹ️  Platform admin bootstrap skipped. Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME to create the initial admin.');
      return null;
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 15000,
    });

    let admin = await User.findOne({ email: adminEmail });
    const adminPayload = {
      name: adminName,
      email: adminEmail,
      phone: String(process.env.ADMIN_PHONE || '').trim(),
      role: 'admin',
      adminType: 'platform',
      adminAreas: [],
    };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    if (admin) {
      const needsUpdate = admin.role !== 'admin'
        || admin.adminType !== 'platform'
        || admin.name !== adminName
        || admin.phone !== adminPayload.phone
        || (admin.adminAreas || []).length !== 0
        || !(await bcrypt.compare(adminPassword, admin.password));

      admin.set({
        ...adminPayload,
        password: hashedPassword,
      });

      await admin.save();

      if (needsUpdate) {
        console.log(`✅ Existing account updated to Platform Admin: ${adminEmail}`);
      } else {
        console.log(`⚠️  Platform admin already exists: ${adminEmail}`);
      }

      return admin;
    }

    admin = new User({
      ...adminPayload,
      password: hashedPassword,
    });

    await admin.save();
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
