const crypto = require('crypto');

const ENCRYPTED_VALUE_PREFIX = 'enc:v1:';

const getEncryptionKey = () => {
  const secret = process.env.BANK_ACCOUNT_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('BANK_ACCOUNT_ENCRYPTION_KEY or JWT_SECRET must be configured to protect bank account details.');
  }

  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('rentalverify-bank-account', 'utf8'),
    Buffer.from('bank-account-encryption:v1', 'utf8'),
    32
  ));
};

const encryptBankAccountNumber = (accountNumber) => {
  const value = String(accountNumber || '').trim();
  if (!value) return '';
  if (value.startsWith(ENCRYPTED_VALUE_PREFIX)) {
    throw new Error('Bank account number is already encrypted.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);

  return [
    ENCRYPTED_VALUE_PREFIX.slice(0, -1),
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
};

const decryptBankAccountNumber = (storedValue) => {
  const value = String(storedValue || '');
  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) return value;

  const [marker, version, ivValue, authTagValue, ciphertextValue] = value.split(':');
  if (marker !== 'enc' || version !== 'v1' || !ivValue || !authTagValue || !ciphertextValue) {
    throw new Error('Stored bank account number has an invalid encrypted format.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivValue, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

const migrateLegacyBankAccountNumbers = async () => {
  const User = require('../models/User');
  const cursor = User.find({
    bankAccountNumber: { $type: 'string', $ne: '', $not: /^enc:v1:/ },
  }).select('_id +bankAccountNumber').cursor();
  let migratedCount = 0;

  for await (const user of cursor) {
    user.bankAccountNumber = encryptBankAccountNumber(user.bankAccountNumber);
    await user.save();
    migratedCount += 1;
  }

  if (migratedCount > 0) {
    console.info(`[SECURITY] Encrypted bank account details for ${migratedCount} existing landlord account(s).`);
  }
};

module.exports = {
  encryptBankAccountNumber,
  decryptBankAccountNumber,
  migrateLegacyBankAccountNumbers,
};
