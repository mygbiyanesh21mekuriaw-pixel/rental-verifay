const test = require('node:test');
const assert = require('node:assert/strict');
const SystemLog = require('../models/SystemLog');
const { logAudit } = require('./auditLogger');

test('logAudit records actor metadata and masks sensitive values', async () => {
  const originalCreate = SystemLog.create;
  let record;
  SystemLog.create = async (entry) => {
    record = entry;
    return entry;
  };
  try {
    await logAudit({
      req: {
        ip: '192.0.2.4',
        auditSessionId: 'session-123',
        get: (name) => name === 'user-agent' ? 'test-agent' : '',
      },
      actor: {
        _id: '507f1f77bcf86cd799439011',
        name: 'Area Admin',
        email: 'admin@example.com',
        role: 'admin',
        adminType: 'area',
      },
      action: 'BANK_INFORMATION_CHANGED',
      module: 'bank_information',
      targetType: 'user',
      targetId: '507f1f77bcf86cd799439012',
      targetLabel: 'Landlord (landlord@example.com)',
      details: {
        accountNumber: '123456789012',
        changedFields: { accountName: { from: 'Old Name', to: 'New Name' } },
        password: 'must-not-be-stored',
      },
    });

    assert.equal(record.role, 'area_admin');
    assert.equal(record.actorName, 'Area Admin');
    assert.equal(record.actorEmail, 'admin@example.com');
    assert.equal(record.ip, '192.0.2.4');
    assert.equal(record.userAgent, 'test-agent');
    assert.equal(record.sessionId, 'session-123');
    assert.equal(record.details.accountNumber, '****9012');
    assert.equal(record.details.password, '[REDACTED]');
  } finally {
    SystemLog.create = originalCreate;
  }
});

test('logAudit never throws when persistence fails', async () => {
  const originalCreate = SystemLog.create;
  const originalConsoleError = console.error;
  SystemLog.create = async () => { throw new Error('database unavailable'); };
  console.error = () => {};
  try {
    const result = await logAudit({ action: 'TEST_ACTION' });
    assert.equal(result, null);
  } finally {
    SystemLog.create = originalCreate;
    console.error = originalConsoleError;
  }
});
