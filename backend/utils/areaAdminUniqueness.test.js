const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const {
  ensureSingleAreaAdminIndex,
  getSingleAreaAdminConflicts,
} = require('./areaAdminUniqueness');

const stubUserFind = (admins) => {
  const originalFind = User.find;
  User.find = () => ({ select: () => ({ lean: async () => admins }) });
  return () => { User.find = originalFind; };
};

test('conflict report groups all assigned Area Admins, including inactive accounts', async () => {
  const restoreFind = stubUserFind([
    { _id: 'active-id', name: 'Active Admin', role: 'admin', adminType: 'area', assignedArea: 'North Ridge', isActive: true },
    { _id: 'inactive-id', name: 'Inactive Admin', role: 'admin', adminType: 'area', assignedArea: 'north ridge', isActive: false },
    { _id: 'platform-id', name: 'Platform Admin', role: 'admin', adminType: 'platform', assignedArea: 'North Ridge' },
  ]);

  try {
    const conflicts = await getSingleAreaAdminConflicts();
    assert.deepEqual(conflicts, [[
      { _id: 'active-id', name: 'Active Admin', area: 'North Ridge', isActive: true },
      { _id: 'inactive-id', name: 'Inactive Admin', area: 'north ridge', isActive: false },
    ]]);
  } finally {
    restoreFind();
  }
});

test('startup creates the username and partial unique area indexes when no conflicts exist', async () => {
  const restoreFind = stubUserFind([]);
  const originalCreateIndex = User.collection.createIndex;
  const originalLog = console.log;
  const calls = [];
  User.collection.createIndex = async (...args) => { calls.push(args); };
  console.log = () => {};

  try {
    assert.equal(await ensureSingleAreaAdminIndex(), true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0][0], { username: 1 });
    assert.equal(calls[0][1].unique, true);
    assert.deepEqual(calls[1][0], { assignedArea: 1 });
    assert.equal(calls[1][1].unique, true);
    assert.deepEqual(calls[1][1].partialFilterExpression, {
      role: 'admin',
      adminType: 'area',
      assignedArea: { $type: 'string', $gt: '' },
    });
    assert.deepEqual(calls[1][1].collation, { locale: 'en', strength: 2 });
  } finally {
    restoreFind();
    User.collection.createIndex = originalCreateIndex;
    console.log = originalLog;
  }
});

test('startup skips the unique area index and logs manual conflict resolution instructions', async () => {
  const restoreFind = stubUserFind([
    { _id: 'active-id', name: 'Active Admin', role: 'admin', adminType: 'area', assignedArea: 'North Ridge', isActive: true },
    { _id: 'inactive-id', name: 'Inactive Admin', role: 'admin', adminType: 'area', assignedArea: 'North Ridge', isActive: false },
  ]);
  const originalCreateIndex = User.collection.createIndex;
  const originalError = console.error;
  const createdIndexes = [];
  const messages = [];
  User.collection.createIndex = async (...args) => { createdIndexes.push(args); };
  console.error = (message) => { messages.push(message); };

  try {
    assert.equal(await ensureSingleAreaAdminIndex(), false);
    assert.equal(createdIndexes.length, 1);
    assert.match(messages.join('\n'), /North Ridge/);
    assert.match(messages.join('\n'), /Deactivation alone does not free the area reservation/);
    assert.match(messages.join('\n'), /reportAreaAdminConflicts\.js/);
  } finally {
    restoreFind();
    User.collection.createIndex = originalCreateIndex;
    console.error = originalError;
  }
});
