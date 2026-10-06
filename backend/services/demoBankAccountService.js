const DemoBankAccount = require('../models/DemoBankAccount');
const DemoBankAccountSequence = require('../models/DemoBankAccountSequence');
const DEMO_BANKS = require('../config/demoBanks');
const MAX_ACCOUNT_NUMBER_ALLOCATION_ATTEMPTS = 50;

const getDemoBank = (bankCode) =>
  DEMO_BANKS.find((bank) => bank.code === String(bankCode || '').trim().toUpperCase());

const formatDemoAccountNumber = (bankCode, sequence) => {
  const bank = getDemoBank(bankCode);
  if (!bank) throw new Error('Cannot format an account number for an unsupported demo bank.');
  if (bank.accountNumberFormat !== 'numeric') {
    throw new Error(`Unsupported demo account-number format for ${bank.code}.`);
  }
  const prefix = bank.accountNumberPrefix || '';
  if (!/^\d*$/.test(prefix) || prefix.length >= bank.accountNumberLength) {
    throw new Error(`Invalid numeric account-number prefix configured for ${bank.code}.`);
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Demo account-number sequence must be a positive safe integer.');
  }

  const digits = String(sequence);
  const sequenceLength = bank.accountNumberLength - prefix.length;
  if (digits.length > sequenceLength) {
    const error = new Error(`Demo account-number capacity reached for ${bank.code}.`);
    error.code = 'DEMO_ACCOUNT_NUMBER_CAPACITY_EXCEEDED';
    throw error;
  }

  return `${prefix}${digits.padStart(sequenceLength, '0')}`;
};

const getNextSequence = async (bankCode) => {
  const sequenceId = `demo-account-${bankCode}`;
  try {
    return await DemoBankAccountSequence.findOneAndUpdate(
      { _id: sequenceId },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return DemoBankAccountSequence.findOneAndUpdate(
      { _id: sequenceId },
      { $inc: { sequence: 1 } },
      { new: true }
    );
  }
};

const createDemoBankAccount = async ({ landlordId, accountName, bankCode }) => {
  const bank = getDemoBank(bankCode);
  const normalizedName = String(accountName || '').trim();
  if (!bank) {
    return { ok: false, code: 'INVALID_DEMO_BANK', message: 'Select one of the available demo banks.' };
  }
  if (!normalizedName || normalizedName.length > 100) {
    return { ok: false, code: 'INVALID_ACCOUNT_NAME', message: 'A valid account name is required.' };
  }

  const existing = await DemoBankAccount.findOne({ landlord: landlordId, status: 'active' });
  if (existing) return { ok: true, created: false, account: existing };

  for (let attempt = 0; attempt < MAX_ACCOUNT_NUMBER_ALLOCATION_ATTEMPTS; attempt += 1) {
    const counter = await getNextSequence(bank.code);
    let accountNumber;
    try {
      accountNumber = formatDemoAccountNumber(bank.code, counter.sequence);
    } catch (error) {
      if (error.code === 'DEMO_ACCOUNT_NUMBER_CAPACITY_EXCEEDED') {
        return {
          ok: false,
          code: error.code,
          message: 'Demo account-number capacity has been reached for this bank. Please contact an administrator.',
        };
      }
      throw error;
    }

    try {
      const [account] = await DemoBankAccount.create([{
        landlord: landlordId,
        bankName: bank.name,
        bankCode: bank.code,
        accountName: normalizedName,
        accountNumber,
        balance: 0,
        status: 'active',
      }]);
      return { ok: true, created: true, account };
    } catch (error) {
      if (error.code !== 11000) throw error;

      const concurrentAccount = await DemoBankAccount.findOne({ landlord: landlordId, status: 'active' });
      if (concurrentAccount) return { ok: true, created: false, account: concurrentAccount };

      const duplicateNumber = await DemoBankAccount.findOne({ accountNumber });
      if (!duplicateNumber) throw error;
    }
  }

  return {
    ok: false,
    code: 'DUPLICATE_DEMO_ACCOUNT_NUMBER',
    message: 'Could not allocate a unique demo account number. Please retry.',
  };
};

const isConfirmedPayment = (payment) => Boolean(
  payment?.status === 'paid' &&
  payment?.verifiedAt &&
  payment?.provider === 'chapa' &&
  payment?.providerReference &&
  payment.providerReference === payment.paymentReference &&
  payment?.providerTransactionReference &&
  Number.isFinite(Number(payment.amount)) &&
  Number(payment.amount) > 0
);

const creditDemoAccountForPayment = async (payment) => {
  if (!isConfirmedPayment(payment)) {
    return { handled: false, credited: false, message: 'Payment has not been confirmed.' };
  }

  const account = await DemoBankAccount.findOne({
    landlord: payment.landlord,
    status: 'active',
  });
  if (!account) return { handled: false, credited: false };

  const alreadyCredited = account.credits.some(
    (credit) => String(credit.payment) === String(payment._id)
  );
  if (alreadyCredited) {
    return {
      handled: true,
      credited: true,
      alreadyCredited: true,
      account,
    };
  }

  const updatedAccount = await DemoBankAccount.findOneAndUpdate(
    {
      _id: account._id,
      status: 'active',
      'credits.payment': { $ne: payment._id },
    },
    {
      $inc: { balance: Number(payment.amount) },
      $push: {
        credits: {
          payment: payment._id,
          tenant: payment.tenant,
          property: payment.property,
          amount: Number(payment.amount),
          currency: payment.currency || 'ETB',
          creditedAt: payment.verifiedAt,
        },
      },
    },
    { new: true, runValidators: true }
  );

  if (updatedAccount) {
    return {
      handled: true,
      credited: true,
      alreadyCredited: false,
      account: updatedAccount,
    };
  }

  const currentAccount = await DemoBankAccount.findById(account._id);
  if (currentAccount?.credits.some(
    (credit) => String(credit.payment) === String(payment._id)
  )) {
    return {
      handled: true,
      credited: true,
      alreadyCredited: true,
      account: currentAccount,
    };
  }

  throw new Error('The active demo bank account could not be credited.');
};

module.exports = {
  DEMO_BANKS,
  getDemoBank,
  formatDemoAccountNumber,
  createDemoBankAccount,
  creditDemoAccountForPayment,
  isConfirmedPayment,
};
