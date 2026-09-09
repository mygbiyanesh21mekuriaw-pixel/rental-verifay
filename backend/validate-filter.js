const mongoose = require('mongoose');
require('dotenv').config();

async function testLandlordNotificationsFilter() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const User = require('./models/User');
    const Notification = require('./models/Notification');
    const Property = require('./models/Property');
    
    const landlord = await User.findOne({ role: 'landlord' });
    const landlordProperties = await Property.find({ landlord: landlord._id }).select('_id').lean();
    const propertyIds = landlordProperties.map(p => p._id);
    
    // Query WITHOUT filter (original)
    const allNotifs = await Notification.find({
      property: { $in: propertyIds }
    }).lean();
    
    // Query WITH filter (new)
    const filteredNotifs = await Notification.find({
      property: { $in: propertyIds },
      message: { $not: /^Your rental request/ }
    }).lean();
    
    const tenantFacingNotifs = allNotifs.filter(n => n.message.startsWith('Your rental request'));
    
    console.log('=== LANDLORD NOTIFICATIONS FILTER TEST ===\n');
    console.log('Landlord: ' + landlord.name);
    console.log('Landlord Properties: ' + landlordProperties.length);
    console.log('\nRESULTS:');
    console.log('Total notifications (no filter): ' + allNotifs.length);
    console.log('Tenant-facing notifications: ' + tenantFacingNotifs.length);
    console.log('Legitimate landlord notifications: ' + filteredNotifs.length);
    
    console.log('\nFILTER VALIDATION:');
    if (tenantFacingNotifs.length > 0 && filteredNotifs.length === allNotifs.length - tenantFacingNotifs.length) {
      console.log('✅ PASS: Filter correctly removes ' + tenantFacingNotifs.length + ' tenant-facing notifications');
      console.log('\nFiltered notifications only show:');
      filteredNotifs.forEach(n => {
        console.log('  - ' + n.message.substring(0, 60) + '...');
      });
      process.exit(0);
    } else if (filteredNotifs.length === allNotifs.length) {
      console.log('⚠️ NO TENANT NOTIFICATIONS: All ' + allNotifs.length + ' notifications are legitimate');
      console.log('\nNotifications:');
      filteredNotifs.forEach(n => {
        console.log('  - ' + n.message.substring(0, 60) + '...');
      });
      process.exit(0);
    } else {
      console.log('❌ FAIL: Filter logic error');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testLandlordNotificationsFilter();
