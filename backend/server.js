const dotenv = require('dotenv');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');
const createAdmin = require('./create-admin');
const { migrateLegacyBankAccountNumbers } = require('./utils/bankAccountCrypto');
const reportInvalidUsernames = require('./utils/reportInvalidUsernames');
const { startPayoutReconciliation } = require('./services/payoutReconciliation');

// የአካባቢ ተለዋዋጮችን ጫን
dotenv.config({ path: path.join(__dirname, '.env') });

const getDevelopmentJwtSecret = () => {
  const secretPath = path.join(__dirname, '.jwt-secret');

  try {
    const savedSecret = fs.readFileSync(secretPath, 'utf8').trim();
    if (savedSecret) return savedSecret;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const generatedSecret = crypto.randomBytes(64).toString('hex');

  try {
    fs.writeFileSync(secretPath, `${generatedSecret}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    return generatedSecret;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existingSecret = fs.readFileSync(secretPath, 'utf8').trim();
    if (existingSecret) return existingSecret;
    fs.writeFileSync(secretPath, `${generatedSecret}\n`, 'utf8');
    return generatedSecret;
  }
};

if (!process.env.JWT_SECRET?.trim()) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production.');
  }

  process.env.JWT_SECRET = getDevelopmentJwtSecret();
  console.warn('JWT_SECRET was missing; using a locally generated development secret.');
}

const app = require('./app');
console.log('==============================');
console.log('RUNNING SERVER FILE:', __filename);
console.log('RUNNING PORT:', process.env.PORT || 5000);
console.log('==============================');

const startServer = async () => {
  await connectDB();
  await migrateLegacyBankAccountNumbers();
  await createAdmin();
  await reportInvalidUsernames();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    startPayoutReconciliation();
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});