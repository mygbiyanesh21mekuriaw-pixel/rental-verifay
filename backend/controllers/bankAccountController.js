const DemoBankAccount = require('../models/DemoBankAccount');
const LandlordCredit = require('../models/LandlordCredit');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const User = require('../models/User');
const {
  DEMO_BANKS,
  createDemoBankAccount,
} = require('../services/demoBankAccountService');
const {
  encryptBankAccountNumber,
  decryptBankAccountNumber,
} = require('../utils/bankAccountCrypto');
const maskBankAccountNumber = require('../utils/maskBankAccountNumber');
const { retryLandlordCredits } = require('../services/landlordCreditService');
const {
  getPayoutEligibilityFailure,
  getVerifiedProviderReference,
  processLandlordPayout,
  toExternalTransferStatus,
} = require('../services/landlordPayoutService');
const { listChapaBanks } = require('../utils/payoutProvider');

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

const toLandlordAccountResponse = (user) => {
  if (!user) return null;

  let storedAccountNumber = '';
  let bankAccountNeedsUpdate = false;
  if (user.bankAccountNumber) {
    try {
      storedAccountNumber = decryptBankAccountNumber(user.bankAccountNumber);
    } catch (error) {
      bankAccountNeedsUpdate = true;
      console.error('[BANK ACCOUNT] Stored account number cannot be decrypted; the landlord must enter it again.');
    }
  }
  const configured = !bankAccountNeedsUpdate &&
    Boolean(user.bankAccountName?.trim() && user.bankCode?.trim() && storedAccountNumber && user.bankAccountConfigured !== false);

  return {
    id: user._id,
    bankName: user.bankName || '',
    bankCode: user.bankCode || '',
    accountName: user.bankAccountName || '',
    accountNumberMasked: maskBankAccountNumber(storedAccountNumber),
    status: configured ? 'active' : 'inactive',
    bankAccountConfigured: configured,
    bankAccountNeedsUpdate,
    bankAccountVerified: user.bankAccountVerified === true,
    bankAccountSource: user.bankAccountSource || 'existing_account',
    balance: Number(user.internalBalance || 0),
    createdAt: user.createdAt,
    currency: 'ETB',
  };
};

const landlordOnly = (req, res) => {
  if (req.user?.role !== 'landlord') {
    res.status(403).json({ message: 'Only landlords can access bank accounts.' });
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

const getSupportedBanks = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    const result = await listChapaBanks();
    if (!result.ok) {
      return res.status(503).json({
        success: false,
        message: result.message || 'Unable to load Chapa-supported banks.',
      });
    }

    return res.status(200).json({ success: true, banks: result.banks });
  } catch (error) {
    console.error('Supported bank lookup failed:', error.message);
    return res.status(502).json({
      success: false,
      message: 'Unable to load Chapa-supported banks.',
    });
  }
};

const createLandlordBankAccount = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    const payload = req.body || {};
    const bankCode = String(payload.bankCode || '').trim();
    const accountName = String(payload.accountName || '').trim();
    const accountNumber = String(payload.accountNumber || '').trim();

    if (!bankCode || !accountName) {
      return res.status(400).json({
        message: 'Bank and account name are required.',
        code: 'BANK_ACCOUNT_DETAILS_REQUIRED',
      });
    }

    const banksResult = await listChapaBanks();
    if (!banksResult.ok) {
      return res.status(503).json({
        code: 'BANK_LIST_UNAVAILABLE',
        message: banksResult.message || 'Unable to validate the selected bank with Chapa.',
      });
    }

    const bank = banksResult.banks.find((option) => option.code === bankCode);
    if (!bank) {
      return res.status(400).json({
        message: 'Select one of the available banks.',
        code: 'INVALID_BANK',
      });
    }

    const landlord = await User.findById(req.user.id).select('+bankAccountNumber');
    if (!landlord || landlord.role !== 'landlord') {
      return res.status(404).json({ message: 'Landlord account not found.' });
    }
    let hasRecoverableAccountNumber = Boolean(landlord.bankAccountNumber);
    if (hasRecoverableAccountNumber) {
      try {
        decryptBankAccountNumber(landlord.bankAccountNumber);
      } catch (error) {
        hasRecoverableAccountNumber = false;
      }
    }
    if (!accountNumber && !hasRecoverableAccountNumber) {
      return res.status(400).json({
        message: 'Account number is required to create your bank account.',
        code: 'BANK_ACCOUNT_NUMBER_REQUIRED',
      });
    }

    landlord.bankName = bank.name;
    landlord.bankCode = bankCode;
    landlord.bankAccountName = accountName;
    if (accountNumber) {
      landlord.bankAccountNumber = encryptBankAccountNumber(accountNumber);
    }
    landlord.bankAccountSource = 'existing_account';
    landlord.bankAccountConfigured = true;
    landlord.bankAccountVerified = false;

    await landlord.save();
    try {
      await retryLandlordCredits(req.user.id);
    } catch (creditError) {
      console.error('[LANDLORD CREDIT] Bank account saved; pending credit retry will be deferred:', creditError.message);
    }
    const updatedLandlord = await User.findById(req.user.id).select('+bankAccountNumber');

    return res.status(200).json({
      success: true,
      message: 'Landlord payout account saved successfully.',
      account: toLandlordAccountResponse(updatedLandlord),
    });
  } catch (error) {
    console.error('Create landlord bank account error:', error);
    return res.status(500).json({ message: 'Unable to save your bank account.' });
  }
};

const getMyBankAccount = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    await retryLandlordCredits(req.user.id);
    const user = await User.findById(req.user.id).select('+bankAccountNumber');
    const account = toLandlordAccountResponse(user);
    return res.status(200).json({
      success: true,
      account: account?.bankAccountConfigured || account?.bankAccountNeedsUpdate ? account : null,
    });
  } catch (error) {
    console.error('Landlord bank account lookup failed.', error);
    return res.status(500).json({ message: 'Unable to load your bank account.' });
  }
};

const getMyBankTransactions = async (req, res) => {
  if (!landlordOnly(req, res)) return;

  try {
    await retryLandlordCredits(req.user.id);
    const creditedPayments = await LandlordCredit.find({
      landlord: req.user.id,
      status: 'CREDITED',
    }).select('payment');
    const paymentById = new Map();
    for (const credit of creditedPayments) {
      const payment = await Payment.findById(credit.payment);
      if (payment) {
        paymentById.set(String(credit.payment), payment);
        await processLandlordPayout(payment);
      }
    }

    const [landlord, credits] = await Promise.all([
      User.findById(req.user.id).select('internalBalance'),
      LandlordCredit.find({ landlord: req.user.id })
        .populate('tenant', 'name')
        .populate('property', 'title')
        .sort({ createdAt: -1 }),
    ]);
    const payouts = await Payout.find({
      landlord: req.user.id,
      payment: { $in: credits.map((credit) => credit.payment) },
    }).select(
      'payment status mode sandboxTransferStatus payoutReference providerReference failureReason providerRequestResponse providerVerificationResponse lastVerifiedAt transferAttemptedAt'
    );
    const payoutByPayment = new Map(
      payouts.map((payout) => [String(payout.payment), payout])
    );

    return res.status(200).json({
      balance: Number(landlord?.internalBalance || 0),
      currency: 'ETB',
      transactions: credits.map((credit) => {
        const payout = payoutByPayment.get(String(credit.payment));
        return {
          id: credit._id,
          type: credit.type,
          description: credit.type === 'RENT_PAYMENT_CREDIT' ? 'Rent payment credit' : credit.type,
          tenant: credit.tenant?.name || 'Unknown tenant',
          property: credit.property?.title || 'Unknown property',
          amount: Number(credit.amount),
          currency: credit.currency,
          direction: 'CREDIT',
          status: credit.status,
          date: credit.creditedAt || credit.createdAt,
          paymentReference: credit.paymentReference,
          providerTransactionReference: credit.providerTransactionReference,
          reason: credit.reason || '',
          externalTransferStatus: payout
            ? toExternalTransferStatus(payout.status, payout.mode)
            : credit.externalTransferStatus,
          payoutStatus: payout?.status || null,
          sandboxTransferStatus: payout?.sandboxTransferStatus || credit.sandboxTransferStatus || null,
          payoutReference: payout?.payoutReference || null,
          providerReference: getVerifiedProviderReference(payout),
          payoutFailureReason: payout?.failureReason ||
            (!payout
              ? getPayoutEligibilityFailure(
                paymentById.get(String(credit.payment)),
                { checkTransferConfiguration: true }
              ) || 'No payout record exists; check backend payout logs for the submission error.'
              : ''),
          payoutMode: payout?.mode || null,
          providerRequestResponse: payout?.providerRequestResponse || null,
          providerVerificationResponse: payout?.providerVerificationResponse || null,
          lastVerifiedAt: payout?.lastVerifiedAt || null,
          transferAttemptedAt: payout?.transferAttemptedAt || null,
        };
      }),
    });
  } catch (error) {
    console.error('Landlord account transaction lookup failed:', error);
    return res.status(500).json({ message: 'Unable to load your account transactions.' });
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
  getSupportedBanks,
  createLandlordBankAccount,
  getMyBankAccount,
  getMyBankTransactions,
  getMyDemoBalance,
  getMyDemoTransactions,
  getAllDemoAccounts,
};
