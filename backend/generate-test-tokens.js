const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function generateTestTokens() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const User = require('./models/User');
    
    const tenantUser = await User.findOne({ role: 'tenant' });
    const landlordUser = await User.findOne({ role: 'landlord' });
    
    if (!tenantUser || !landlordUser) {
      console.error('Test users not found');
      process.exit(1);
    }
    
    const JWT_SECRET = process.env.JWT_SECRET;
    
    const tenantToken = jwt.sign(
      { id: tenantUser._id, role: 'tenant' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const landlordToken = jwt.sign(
      { id: landlordUser._id, role: 'landlord' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('=== TEST TOKENS FOR BROWSER TESTING ===\n');
    console.log(`Tenant (${tenantUser.name}):`);
    console.log(`  localStorage.setItem('token', '${tenantToken}');`);
    console.log(`  localStorage.setItem('user', '${JSON.stringify({ id: tenantUser._id, name: tenantUser.name, email: tenantUser.email, role: 'tenant' })}');`);
    
    console.log(`\nLandlord (${landlordUser.name}):`);
    console.log(`  localStorage.setItem('token', '${landlordToken}');`);
    console.log(`  localStorage.setItem('user', '${JSON.stringify({ id: landlordUser._id, name: landlordUser.name, email: landlordUser.email, role: 'landlord' })}');`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

generateTestTokens();
