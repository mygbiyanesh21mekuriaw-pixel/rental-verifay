const DemoBankAccount = require('../models/DemoBankAccount');
const User = require('../models/User');
const {
  DEMO_BANKS,
  createDemoBankAccount,
} = require('../services/demoBankAccountService');

const toAccountResponse = (account) => account ? ({
  id: account._id,
  bankName: account.bankName,
  bankCode: account.bankCode,
  accountName: account.accountName,
  accountNumber: account.accountNumber,
  balance: Number(account.balance || 0),
  currency: 'ETB',
  status: account.status,
  createdAt: account.createdAt,
}) : null;

const landlordOnly = (req, res) => {
  if (req.user?.role !== 'landlord') {
    res.status(403).json({ message: 'Only landlords can access demo bank accounts.' });
    return false;
  }
  return true;
};

const getDemoBanks = (req, res) => {
  if (!landlordOnly(req, res)) return;
  return res.json(DEMO_BANKS);
};

const createDemoAccount = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    const landlord = await User.findById(req.user.id).select('name role');
    if (!landlord || landlord.role !== 'landlord') {
      return res.status(404).json({ message: 'Landlord account not found.' });
    }

    const result = await createDemoBankAccount({
      landlordId: landlord._id,
      bankCode: req.body.bankCode,
      accountName: landlord.name,
    });
    if (!result.ok) {
      const statusCode = result.code === 'INVALID_DEMO_BANK' ||
        result.code === 'INVALID_ACCOUNT_NAME' ? 400 :
        result.code === 'DEMO_ACCOUNT_NUMBER_CAPACITY_EXCEEDED' ? 503 : 409;
      return res.status(statusCode).json({
        code: result.code,
        message: result.message,
      });
    }

    return res.status(result.created ? 201 : 200).json({
      message: result.created
        ? 'Your demo bank account is now active.'
        : 'Your demo bank account is already registered.',
      account: toAccountResponse(result.account),
    });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await DemoBankAccount.findOne({
        landlord: req.user.id,
        status: 'active',
      });
      if (existing) {
        return res.status(200).json({
          message: 'Your demo bank account is already registered.',
          account: toAccountResponse(existing),
        });
      }
    }
    console.error('Demo bank account creation failed.');
    return res.status(500).json({ message: 'Unable to create your demo bank account. Please retry.' });
  }
};

const getMyDemoAccount = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    const account = await DemoBankAccount.findOne({
      landlord: req.user.id,
      status: 'active',
    });
    return res.status(200).json({
      success: true,
      account: toAccountResponse(account),
    });
  } catch (error) {
    console.error('Demo bank account lookup failed.');
    return res.status(500).json({ message: 'Unable to load your demo bank account.' });
  }
};

const getMyDemoBalance = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    const account = await DemoBankAccount.findOne({
      landlord: req.user.id,
      status: 'active',
    }).select('balance status');
    if (!account) {
      return res.status(404).json({ message: 'Create a demo bank account to view its balance.' });
    }
    return res.json({
      balance: Number(account.balance || 0),
      currency: 'ETB',
      status: account.status,
    });
  } catch (error) {
    console.error('Demo bank balance lookup failed.');
    return res.status(500).json({ message: 'Unable to load your demo bank balance.' });
  }
};

const getMyDemoTransactions = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    const account = await DemoBankAccount.findOne({
      landlord: req.user.id,
      status: 'active',
    })
      .select('_id accountNumber credits')
      .populate('credits.tenant', 'name')
      .populate('credits.property', 'title');
    if (!account) return res.json({ transactions: [] });

    return res.json({
      transactions: account.credits
        .slice()
        .sort((left, right) => new Date(right.creditedAt) - new Date(left.creditedAt))
        .map((credit) => ({
        id: credit._id,
        paymentId: credit.payment,
        tenant: credit.tenant?.name || 'Unknown tenant',
        property: credit.property?.title || 'Unknown property',
        amount: Number(credit.amount),
        currency: credit.currency,
        paymentStatus: 'Paid',
        status: 'credited',
        creditedTo: account.accountNumber,
        creditedAt: credit.creditedAt,
      })),
    });
  } catch (error) {
    console.error('Demo bank transaction history lookup failed.');
    return res.status(500).json({ message: 'Unable to load your demo account payment history.' });
  }
};

const getAllDemoAccounts = async (req, res) => {
  try {
    const accounts = await DemoBankAccount.find({})
      .populate('landlord', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    return res.json(accounts.map((account) => ({
      _id: account._id,
      landlord: account.landlord?.name || 'Unknown landlord',
      landlordEmail: account.landlord?.email || '',
      bankName: account.bankName,
      bankCode: account.bankCode,
      accountNumber: account.accountNumber,
      balance: Number(account.balance || 0),
      status: account.status,
      createdAt: account.createdAt,
    })));
  } catch (error) {
    console.error('Admin demo bank accounts lookup failed.');
    return res.status(500).json({ message: 'Unable to load demo bank accounts.' });
  }
};

module.exports = {
  getDemoBanks,
  createDemoAccount,
  getMyDemoAccount,
  getMyDemoBalance,
  getMyDemoTransactions,
  getAllDemoAccounts,
};
