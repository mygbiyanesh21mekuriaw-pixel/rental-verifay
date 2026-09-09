const mongoose = require('mongoose');
require('dotenv').config();

async function inspectLandlordNotifications() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const User = require('./models/User');
    const Notification = require('./models/Notification');
    const Property = require('./models/Property');
    
    const landlord = await User.findOne({ role: 'landlord' });
    
    if (!landlord) {
      console.error('No landlord found');
      process.exit(1);
    }
    
    console.log('=== LANDLORD NOTIFICATIONS INSPECTION ===\n');
    console.log('Landlord:', landlord.name + ' (' + landlord._id + ')\n');
    
    // Get landlord's properties
    const landlordProperties = await Property.find({ landlord: landlord._id }).select('_id title').lean();
    console.log('Landlord Properties:');
    landlordProperties.forEach(p => {
      console.log('  - ' + p.title + ' (' + p._id + ')');
    });
    
    const propertyIds = landlordProperties.map(p => p._id);
    
    // Find all notifications for this landlord's properties (with filter)
    const notifications = await Notification.find({
      property: { $in: propertyIds },
      message: { $not: /^Your rental request/ }  // Exclude tenant-facing notifications
    }).populate('tenant', 'name').populate('property', 'title').lean();
    
    console.log('\nNotifications for Landlord Properties: ' + notifications.length + '\n');
    
    if (notifications.length > 0) {
      notifications.forEach((n, i) => {
        console.log(i + 1 + '.');
        console.log('  Message: ' + n.message);
        console.log('  Type: ' + (n.type || 'info'));
        console.log('  Property: ' + (n.property?.title || 'N/A'));
        console.log('  Tenant: ' + (n.tenant?.name || 'N/A'));
        console.log('  Read: ' + n.read);
        console.log('');
      });
    }
    
    // Also check what messages contain "rental" or "request"
    const allLandlordNotifs = await Notification.find({
      property: { $in: propertyIds }
    }).lean();
    
    const rentalRequestNotifs = allLandlordNotifs.filter(n => 
      n.message.toLowerCase().includes('rental') || n.message.toLowerCase().includes('request')
    );
    
    console.log('Notifications mentioning "rental" or "request": ' + rentalRequestNotifs.length);
    if (rentalRequestNotifs.length > 0) {
      rentalRequestNotifs.forEach(n => {
        console.log('  - ' + n.message);
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

inspectLandlordNotifications();
