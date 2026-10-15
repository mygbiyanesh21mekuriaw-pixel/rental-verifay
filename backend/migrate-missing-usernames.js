require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const usernamePattern = /^[a-z0-9_]{3,20}$/;

const createUsernameBase = (user) => {
  const emailLocalPart = String(user.email || '').split('@')[0] || '';
  const base = emailLocalPart
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');

  if (base.length >= 3) return base.slice(0, 20);

  const idSuffix = String(user._id || '').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase();
  return `user${idSuffix || 'account'}`.slice(0, 20);
};

const planMissingUsernames = (users) => {
  const reservedUsernames = new Set(
    users
      .map((user) => typeof user.username === 'string' ? user.username.trim().toLowerCase() : '')
      .filter(Boolean)
  );
  const usersMissingUsernames = users
    .filter((user) => typeof user.username !== 'string' || !user.username.trim())
    .slice()
    .sort((first, second) => String(first._id).localeCompare(String(second._id)));

  return usersMissingUsernames.map((user) => {
    const base = createUsernameBase(user);
    let candidate = base;
    let suffix = 2;

    while (!usernamePattern.test(candidate) || reservedUsernames.has(candidate.toLowerCase())) {
      const suffixText = String(suffix);
      candidate = `${base.slice(0, 20 - suffixText.length)}${suffixText}`;
      suffix += 1;
    }

    reservedUsernames.add(candidate.toLowerCase());
    return { userId: user._id, username: candidate };
  });
};

const migrateMissingUsernames = async ({ apply = false } = {}) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rental-db';
  await mongoose.connect(mongoUri);

  try {
    const users = await User.find({})
      .select('_id email username')
      .lean();
    const assignments = planMissingUsernames(users);

    if (!assignments.length) {
      console.log('All accounts already have usernames.');
      return assignments;
    }

    for (const assignment of assignments) {
      console.log(`${String(assignment.userId)} -> ${assignment.username}`);
    }

    if (!apply) {
      console.log(`Dry run: ${assignments.length} username(s) would be assigned. Re-run with --apply to save these username fields.`);
      return assignments;
    }

    for (const assignment of assignments) {
      const result = await User.updateOne(
        {
          _id: assignment.userId,
          $or: [
            { username: { $exists: false } },
            { username: null },
            { username: /^\s*$/ },
          ],
        },
        { $set: { username: assignment.username } },
        { runValidators: true }
      );

      if (result.matchedCount !== 1) {
        throw new Error(`Account ${String(assignment.userId)} changed during migration; no password or other account fields were modified.`);
      }
    }

    console.log(`Assigned usernames to ${assignments.length} account(s). Passwords and other account fields were not changed.`);
    return assignments;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  migrateMissingUsernames({ apply: process.argv.includes('--apply') })
    .catch((error) => {
      console.error('Username migration failed:', error.message);
      process.exitCode = 1;
    });
}

module.exports = { planMissingUsernames, migrateMissingUsernames };
