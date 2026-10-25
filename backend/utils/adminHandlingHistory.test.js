const test = require('node:test');
const assert = require('node:assert/strict');
const { appendAdminDecision, UNKNOWN_HANDLER_NAME } = require('./adminHandlingHistory');

test('admin decisions append immutable name snapshots and update the latest-decision fields', () => {
  const item = { history: [] };
  const admin = { _id: 'admin-id', name: 'Admin A' };
  const firstAt = new Date('2026-01-01T10:00:00Z');
  const secondAt = new Date('2026-01-02T10:00:00Z');

  appendAdminDecision(item, admin, 'rejected', 'Needs a document', firstAt);
  admin.name = 'Renamed Admin';
  appendAdminDecision(item, admin, 'verified', '', secondAt);

  assert.equal(item.history.length, 2);
  assert.equal(item.history[0].byName, 'Admin A');
  assert.equal(item.history[0].note, 'Needs a document');
  assert.equal(item.history[1].byName, 'Renamed Admin');
  assert.equal(item.handledByName, 'Renamed Admin');
  assert.equal(item.handledByRole, 'area_admin');
  assert.equal(item.handledAt, secondAt);
  assert.equal(item.decision, 'verified');
});

test('missing administrator name is stored with the explicit legacy marker', () => {
  const item = {};
  appendAdminDecision(item, { _id: 'admin-id' }, 'returned');
  assert.equal(item.handledByName, UNKNOWN_HANDLER_NAME);
  assert.equal(item.history[0].byName, UNKNOWN_HANDLER_NAME);
});
