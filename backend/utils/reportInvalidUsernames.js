const User = require('../models/User');

const validUsernamePattern = /^[a-z0-9_]{3,20}$/;

const reportInvalidUsernames = async () => {
  const users = await User.find({
    username: { $exists: true, $nin: [null, ''] },
  })
    .select('_id email username')
    .lean();
  const invalidUsers = users.filter((user) =>
    typeof user.username !== 'string' ||
    !validUsernamePattern.test(user.username)
  );

  if (invalidUsers.length === 0) {
    console.log('✅ No existing usernames violate the current username rules.');
    return [];
  }

  console.warn(`⚠️  Found ${invalidUsers.length} existing user(s) with usernames outside the current rules. No data was changed:`);
  for (const user of invalidUsers) {
    console.warn(`   User ${user._id} (${user.email || 'no email'}): ${JSON.stringify(user.username)}`);
  }
  return invalidUsers;
};

module.exports = reportInvalidUsernames;
