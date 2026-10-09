const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const http = require('http');

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testLandlordNotificationsFilter() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const User = require('./models/User');
    
    const landlord = await User.findOne({ role: 'landlord' });
    const JWT_SECRET = process.env.JWT_SECRET;
    
    const landlordToken = jwt.sign(
      { id: landlord._id, role: 'landlord' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('=== LANDLORD NOTIFICATIONS API TEST ===\n');
    console.log('Landlord: ' + landlord.name + '\n');
    
    // Test the API
    const response = await makeRequest('GET', '/api/notifications', {
      Authorization: `Bearer ${landlordToken}`
    });
    
    const notifications = response.data;
    
    console.log('Notifications returned: ' + notifications.length + '\n');
    
    if (Array.isArray(notifications)) {
      console.log('RESULTS:');
      notifications.forEach((n, i) => {
        console.log(i + 1 + '.');
        console.log('  Message: ' + n.message);
        console.log('  Type: ' + (n.type || 'info'));
        console.log('');
      });
      
      // Check if any "Your rental request" messages exist
      const tenantFacingNotifs = notifications.filter(n => 
        n.message.startsWith('Your rental request')
      );
      
      if (tenantFacingNotifs.length === 0) {
        console.log('✅ PASS: No tenant-facing "Your rental request" notifications found');
      } else {
        console.log('❌ FAIL: Found ' + tenantFacingNotifs.length + ' tenant-facing notifications:');
        tenantFacingNotifs.forEach(n => console.log('  - ' + n.message));
      }
    } else {
      console.log('❌ Error: Response is not an array');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testLandlordNotificationsFilter();
