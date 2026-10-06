const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getDemoBanks,
  createDemoAccount,
  getMyDemoAccount,
  getMyDemoBalance,
  getMyDemoTransactions,
} = require('../controllers/bankAccountController');

const router = express.Router();

router.get('/demo/banks', auth, getDemoBanks);
router.post('/demo', auth, createDemoAccount);
router.get('/my-account', auth, getMyDemoAccount);
router.get('/my-account/balance', auth, getMyDemoBalance);
router.get('/my-account/transactions', auth, getMyDemoTransactions);

module.exports = router;
