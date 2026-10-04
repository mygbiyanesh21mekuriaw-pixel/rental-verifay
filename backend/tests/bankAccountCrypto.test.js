const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encryptBankAccountNumber,
  decryptBankAccountNumber,
} = require('../utils/bankAccountCrypto');

test('encrypts account numbers and decrypts them for payout use', () => {
  const previousKey = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'test-only-bank-encryption-key';

  try {
    const encrypted = encryptBankAccountNumber('001234567890');
    assert.notEqual(encrypted, '001234567890');
    assert.match(encrypted, /^enc:v1:/);
    assert.equal(decryptBankAccountNumber(encrypted), '001234567890');
    assert.equal(decryptBankAccountNumber('001234567890'), '001234567890');
  } finally {
    if (previousKey === undefined) delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
    else process.env.BANK_ACCOUNT_ENCRYPTION_KEY = previousKey;
  }
});

test('rejects tampered encrypted account numbers', () => {
  const previousKey = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'test-only-bank-encryption-key';

  try {
    const encrypted = encryptBankAccountNumber('001234567890');
    const parts = encrypted.split(':');
    parts[4] = `${parts[4][0] === 'A' ? 'B' : 'A'}${parts[4].slice(1)}`;
    const tampered = parts.join(':');
    assert.throws(() => decryptBankAccountNumber(tampered));
  } finally {
    if (previousKey === undefined) delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
    else process.env.BANK_ACCOUNT_ENCRYPTION_KEY = previousKey;
  }
});
