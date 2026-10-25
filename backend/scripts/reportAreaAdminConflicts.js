require('dotenv').config();
const mongoose = require('mongoose');
const { getSingleAreaAdminConflicts } = require('../utils/areaAdminUniqueness');

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to report Area Admin conflicts.');
  }
  await mongoose.connect(process.env.MONGO_URI);
  const conflicts = await getSingleAreaAdminConflicts();

  if (conflicts.length === 0) {
    console.log('No areas have more than one Area Admin.');
    return;
  }

  console.log(`Found ${conflicts.length} Area Admin area conflict${conflicts.length === 1 ? '' : 's'}:`);
  conflicts.forEach((admins) => {
    console.log(`\n${admins[0].area}`);
    admins.forEach((admin) => {
      console.log(`  ${admin.name} | ${admin._id} | ${admin.isActive ? 'active' : 'inactive'}`);
    });
  });
  console.log('\nThis report is read-only. Resolve each conflict manually by editing an admin to another area or demoting/deactivating an admin. Deactivation retains the area reservation; demotion or reassignment frees it.');
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('Area Admin conflict report failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = { run };
