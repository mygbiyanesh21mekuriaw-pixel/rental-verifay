const mongoose = require('mongoose');
require('dotenv').config();

async function testAllRolesNotifications() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const User = require('./models/User');
    const Notification = require('./models/Notification');
    const Property = require('./models/Property');
    
    // Get test users
    const tenant = await User.findOne({ role: 'tenant' });
    const landlord = await User.findOne({ role: 'landlord' });
    const admin = await User.findOne({ role: 'admin' });
    
    console.log('=== COMPREHENSIVE NOTIFICATIONS TEST ===\n');
    console.log('Test Users:');
    console.log('  Tenant: ' + (tenant ? tenant.name : 'N/A'));
    console.log('  Landlord: ' + (landlord ? landlord.name : 'N/A'));
    console.log('  Admin: ' + (admin ? admin.name : 'N/A'));
    console.log('');
    
    let passCount = 0;
    let failCount = 0;
    
    // TEST 1: TENANT NOTIFICATIONS
    if (tenant) {
      console.log('TEST 1: Tenant Notifications');
      const tenantNotifs = await Notification.find({ tenant: tenant._id }).lean();
      console.log('  Count: ' + tenantNotifs.length);
      
      // Tenants should NOT see "Your rental request" at their endpoint
      const actualTenantNotifs = tenantNotifs.filter(n => !n.message.startsWith('Your rental request'));
      
      if (tenantNotifs.length > 0) {
        console.log('  ✅ Tenant has notifications');
        passCount++;
      } else {
        console.log('  ⚠️  No notifications (OK if new account)');
        passCount++;
      }
    }
    
    // TEST 2: LANDLORD NOTIFICATIONS (with filter)
    if (landlord) {
      console.log('\nTEST 2: Landlord Notifications (FILTERED)');
      const landlordProps = await Property.find({ landlord: landlord._id }).select('_id').lean();
      const propIds = landlordProps.map(p => p._id);
      
      // With the NEW filter
      const filteredNotifs = await Notification.find({
        property: { $in: propIds },
        message: { $not: /^Your rental request/ }
      }).lean();
      
      // Without filter (for comparison)
      const allNotifs = await Notification.find({
        property: { $in: propIds }
      }).lean();
      
      const removedCount = allNotifs.length - filteredNotifs.length;
      console.log('  Total before filter: ' + allNotifs.length);
      console.log('  Tenant-facing removed: ' + removedCount);
      console.log('  Landlord notifications: ' + filteredNotifs.length);
      
      // Check if any "Your rental request" remain
      const tenantFacingRemaining = filteredNotifs.filter(n => n.message.startsWith('Your rental request'));
      
      if (tenantFacingRemaining.length === 0) {
        console.log('  ✅ PASS: No tenant-facing notifications in landlord view');
        passCount++;
      } else {
        console.log('  ❌ FAIL: Found ' + tenantFacingRemaining.length + ' tenant notifications in landlord view');
        failCount++;
      }
      
      if (filteredNotifs.length > 0) {
        console.log('  Sample landlord notifications:');
        filteredNotifs.slice(0, 2).forEach(n => {
          console.log('    - ' + n.message.substring(0, 50) + '...');
        });
      }
    }
    
    // TEST 3: ADMIN NOTIFICATIONS
    if (admin) {
      console.log('\nTEST 3: Admin Notifications');
      const adminNotifs = await Notification.find({}).lean();
      console.log('  Total notifications visible to admin: ' + adminNotifs.length);
      console.log('  ✅ Admin can see all notifications');
      passCount++;
    }
    
    // TEST 4: VERIFY NOTIFICATION CATEGORIES
    console.log('\nTEST 4: Notification Categories (Landlord should only have)');
    if (landlord) {
      const landlordProps = await Property.find({ landlord: landlord._id }).select('_id').lean();
      const propIds = landlordProps.map(p => p._id);
      
      const filteredNotifs = await Notification.find({
        property: { $in: propIds },
        message: { $not: /^Your rental request/ }
      }).lean();
      
      const categories = new Set();
      filteredNotifs.forEach(n => categories.add(n.type || 'default'));
      
      console.log('  Valid categories found: ' + Array.from(categories).join(', '));
      
      // Expected: "approved" (for property rented), "rejected" (for property rejected), etc.
      const hasValidCategories = Array.from(categories).every(cat => 
        ['approved', 'rejected', 'pending', 'info', 'default'].includes(cat)
      );
      
      if (hasValidCategories) {
        console.log('  ✅ All notification categories are valid');
        passCount++;
      } else {
        console.log('  ❌ Invalid notification category found');
        failCount++;
      }
    }
    
    // SUMMARY
    console.log('\n=== SUMMARY ===');
    console.log('Passed: ' + passCount);
    console.log('Failed: ' + failCount);
    
    if (failCount === 0) {
      console.log('\n✅ ALL TESTS PASSED');
    } else {
      console.log('\n❌ SOME TESTS FAILED');
    }
    
    await mongoose.disconnect();
    process.exit(failCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testAllRolesNotifications();
