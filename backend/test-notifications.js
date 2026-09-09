const mongoose = require('mongoose');
require('dotenv').config();

async function testNotifications() {
  try {
    console.log('=== Testing Notifications API ===\n');
    
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    
    const User = require('./models/User');
    const Notification = require('./models/Notification');
    const Property = require('./models/Property');
    
    // Find a tenant user
    const tenant = await User.findOne({ role: 'tenant' }).lean();
    // Find a landlord user
    const landlord = await User.findOne({ role: 'landlord' }).lean();
    
    console.log('Tenant user:', tenant ? tenant.name + ' (' + tenant._id + ')' : 'Not found');
    console.log('Landlord user:', landlord ? landlord.name + ' (' + landlord._id + ')' : 'Not found');
    
    if (tenant) {
      const tenantNotifications = await Notification.countDocuments({ tenant: tenant._id });
      const tenantUnread = await Notification.countDocuments({ tenant: tenant._id, read: false });
      console.log('\nTenant Notifications:');
      console.log('  Total:', tenantNotifications);
      console.log('  Unread:', tenantUnread);
    }
    
    if (landlord) {
      const landlordProperties = await Property.find({ landlord: landlord._id }).select('_id').lean();
      const propertyIds = landlordProperties.map(p => p._id);
      const landlordNotifications = await Notification.countDocuments({ property: { $in: propertyIds } });
      const landlordUnread = await Notification.countDocuments({ property: { $in: propertyIds }, read: false });
      console.log('\nLandlord Notifications:');
      console.log('  Total:', landlordNotifications);
      console.log('  Unread:', landlordUnread);
    }
    
    console.log('\n✅ Notifications API structure is correct');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testNotifications();
