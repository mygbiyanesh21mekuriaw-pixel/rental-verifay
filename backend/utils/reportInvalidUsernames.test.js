const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const reportInvalidUsernames = require('./reportInvalidUsernames');

test('reports invalid stored usernames without modifying user records', async () => {
  const originalFind = User.find;
  const originalConsoleWarn = console.warn;
  const warnings = [];
  User.find = () => ({
    select() {
      return {
        lean: async () => [
          { _id: 'valid-id', email: 'valid@example.com', username: 'valid_user' },
          { _id: 'invalid-id', email: 'invalid@example.com', username: 'legacy.user' },
          { _id: 'invalid-case-id', email: 'case@example.com', username: 'Uppercase' },
        ],
      };
    },
  });
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const invalidUsers = await reportInvalidUsernames();
    assert.deepEqual(invalidUsers.map((user) => user._id), ['invalid-id', 'invalid-case-id']);
    assert.match(warnings.join('\n'), /legacy\.user/);
    assert.match(warnings.join('\n'), /Uppercase/);
  } finally {
    User.find = originalFind;
    console.warn = originalConsoleWarn;
  }
});
