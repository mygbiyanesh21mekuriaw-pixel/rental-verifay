require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rental-db';

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 15000,
    });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    let admin = await User.findOne({ email: 'testadmin@test.com' });

    if (admin) {
      console.log('⚠️  Admin already exists: testadmin@test.com');
      return admin;
    }

    admin = new User({
      name: 'Test Admin',
      email: 'testadmin@test.com',
      password: hashedPassword,
      phone: '0911234567',
      role: 'admin',
    });

    await admin.save();
    console.log('✅ Admin created successfully!');
    console.log('📧 Email: testadmin@test.com');
    console.log('🔐 Password: admin123');
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
