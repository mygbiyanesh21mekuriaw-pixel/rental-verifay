const mongoose = require('mongoose');
require('dotenv').config();

async function findCongratulationsNotifications() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const Notification = require('./models/Notification');
    
    // Find notifications that have the congratulations message
    const notifs = await Notification.find({
      message: { $regex: 'እንኳን ደስ አለዎት|congratulations', $options: 'i' }
    }).lean();
    
    console.log('=== CONGRATULATIONS MESSAGE NOTIFICATIONS ===\n');
    console.log('Found: ' + notifs.length + '\n');
    
    notifs.forEach(n => {
      console.log('Notification:');
      console.log('  Message:', n.message);
      console.log('  Tenant ID:', n.tenant);
      console.log('  Property ID:', n.property);
      console.log('  Type:', n.type);
      console.log('  Rental Request ID:', n.rentalRequest);
      console.log('');
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findCongratulationsNotifications();
