const express = require('express');
const { auth } = require('../middleware/auth');
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
} = require('../controllers/bankAccountController');

const router = express.Router();

router.get('/banks', auth, getSupportedBanks);
router.post('/', auth, createLandlordBankAccount);
router.get('/me', auth, getMyBankAccount);
router.get('/my-account', auth, getMyBankAccount);
router.get('/my-account/transactions', auth, getMyBankTransactions);
router.get('/demo/banks', auth, getDemoBanks);
router.post('/demo', auth, createDemoAccount);
router.get('/demo/my-account', auth, getMyDemoAccount);
router.get('/my-account/balance', auth, getMyDemoBalance);

module.exports = router;
