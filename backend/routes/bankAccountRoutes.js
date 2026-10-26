const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const {
  getDemoBanks,
  createDemoAccount,
  getMyDemoAccount,
  getMyDemoBalance,
  getMyDemoTransactions,
  getSupportedBanks,
  createLandlordBankAccount,
  getMyBankAccount,
  getMyBankTransactions,
  retryMyPayoutVerification,
} = require('../controllers/bankAccountController');

const router = express.Router();

router.get('/banks', auth, requirePermission('bankInformation'), getSupportedBanks);
router.post('/', auth, requirePermission('bankInformation'), createLandlordBankAccount);
router.get('/me', auth, requirePermission('bankInformation'), getMyBankAccount);
router.get('/my-account', auth, requirePermission('bankInformation'), getMyBankAccount);
router.get('/my-account/transactions', auth, requirePermission('bankInformation'), getMyBankTransactions);
router.post('/my-account/transactions/:reference/verify', auth, requirePermission('bankInformation'), retryMyPayoutVerification);
router.get('/demo/banks', auth, requirePermission('bankInformation'), getDemoBanks);
router.post('/demo', auth, requirePermission('bankInformation'), createDemoAccount);
router.get('/demo/my-account', auth, requirePermission('bankInformation'), getMyDemoAccount);
router.get('/my-account/balance', auth, requirePermission('bankInformation'), getMyDemoBalance);

module.exports = router;
