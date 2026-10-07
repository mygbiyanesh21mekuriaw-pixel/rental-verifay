const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const LandlordCredit = require('../models/LandlordCredit');
const Payment = require('../models/Payment');
const Property = require('../models/Property');
const User = require('../models/User');
const { creditLandlordForPayment } = require('../services/landlordCreditService');

const confirmedPayment = () => ({
  _id: 'payment-id',
  tenant: 'tenant-id',
  landlord: 'landlord-id',
  property: 'property-id',
  amount: 2000,
  currency: 'ETB',
  provider: 'chapa',
  paymentReference: 'RP-payment-id',
  providerReference: 'RP-payment-id',
  providerTransactionReference: 'CHAPA-transaction-id',
  status: 'paid',
  verifiedAt: new Date('2026-10-07T10:00:00.000Z'),
});

const savedLandlord = () => ({
  _id: 'landlord-id',
  role: 'landlord',
  bankAccountName: 'Landlord Account',
  bankAccountNumber: 'enc:v1:encrypted-account-number',
  bankCode: 'CBE',
  bankName: 'Commercial Bank of Ethiopia (CBE)',
  bankAccountConfigured: true,
  bankAccountSource: 'existing_account',
  internalBalance: 0,
});

const withCreditStore = async ({ landlord = savedLandlord(), propertyOwner = 'landlord-id' } = {}, run) => {
  const originals = {
    startSession: mongoose.startSession,
    findPropertyById: Property.findById,
    findUserById: User.findById,
    updateUser: User.findOneAndUpdate,
    findCredit: LandlordCredit.findOne,
    updateCredit: LandlordCredit.findOneAndUpdate,
    createCredit: LandlordCredit.create,
  };
  const credits = [];
  const session = {
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  };
  mongoose.startSession = async () => session;
  Property.findById = () => ({
    select: async () => ({ _id: 'property-id', landlord: propertyOwner }),
  });
  User.findById = () => ({
    select: async () => landlord,
  });
  User.findOneAndUpdate = async (filter, update) => {
    if (String(filter._id) !== String(landlord?._id) || filter.role !== 'landlord') return null;
    landlord.internalBalance = Number(landlord.internalBalance || 0) + update.$inc.internalBalance;
    return landlord;
  };
  LandlordCredit.findOne = (filter) => ({
    then: (resolve, reject) => Promise.resolve(
      credits.find((credit) => String(credit.payment) === String(filter.payment)) || null
    ).then(resolve, reject),
  });
  LandlordCredit.create = async (records) => {
    const [credit] = records;
    credits.push({ _id: `credit-${credits.length + 1}`, ...credit });
    return [credits[credits.length - 1]];
  };
  LandlordCredit.findOneAndUpdate = async (filter, update, options) => {
    let credit = filter._id
      ? credits.find((item) => String(item._id) === String(filter._id))
      : credits.find((item) => String(item.payment) === String(filter.payment));
    if (credit?.status === 'CREDITED') return null;
    if (!credit && (options?.upsert || filter.status?.$ne === 'CREDITED') && update.$set?.payment) {
      credit = {
        _id: `credit-${credits.length + 1}`,
        externalTransferStatus: update.$setOnInsert?.externalTransferStatus || 'NOT_EXECUTED',
      };
      credits.push(credit);
    }
    if (!credit) return null;
    Object.assign(credit, update.$set);
    return credit;
  };

  try {
    await run({ credits, landlord });
  } finally {
    mongoose.startSession = originals.startSession;
    Property.findById = originals.findPropertyById;
    User.findById = originals.findUserById;
    User.findOneAndUpdate = originals.updateUser;
    LandlordCredit.findOne = originals.findCredit;
    LandlordCredit.findOneAndUpdate = originals.updateCredit;
    LandlordCredit.create = originals.createCredit;
  }
};

test('verified rent payment credits the landlord who owns the property with the exact amount', async () => {
  await withCreditStore({}, async ({ landlord, credits }) => {
    const result = await creditLandlordForPayment(confirmedPayment());

    assert.equal(result.status, 'CREDITED');
    assert.equal(landlord.internalBalance, 2000);
    assert.equal(credits.length, 1);
    assert.equal(credits[0].landlord, 'landlord-id');
    assert.equal(credits[0].bankCode, 'CBE');
    assert.equal(credits[0].amount, 2000);
    assert.equal(credits[0].providerTransactionReference, 'CHAPA-transaction-id');
    assert.equal(credits[0].status, 'CREDITED');
    assert.equal(credits[0].externalTransferStatus, 'NOT_EXECUTED');
  });
});

test('duplicate verified payment processing does not credit the landlord twice', async () => {
  await withCreditStore({}, async ({ landlord, credits }) => {
    const payment = confirmedPayment();
    await creditLandlordForPayment(payment);
    const duplicate = await creditLandlordForPayment(payment);

    assert.equal(duplicate.status, 'CREDITED');
    assert.equal(duplicate.alreadyCredited, true);
    assert.equal(landlord.internalBalance, 2000);
    assert.equal(credits.length, 1);
  });
});

test('a provider transaction reference already used by a different payment cannot credit twice', async () => {
  const landlord = {
    ...savedLandlord(),
    internalCreditReferences: [{
      payment: 'another-payment-id',
      providerTransactionReference: 'CHAPA-transaction-id',
      amount: 2000,
      creditedAt: new Date(),
    }],
  };
  await withCreditStore({ landlord }, async ({ credits }) => {
    const result = await creditLandlordForPayment(confirmedPayment());

    assert.equal(result.status, 'FAILED');
    assert.match(result.reason, /already associated with another payment/i);
    assert.equal(landlord.internalBalance, 0);
    assert.equal(credits.length, 1);
    assert.equal(credits[0].status, 'FAILED');
  });
});

test('unverified or failed tenant payments do not create a landlord credit', async () => {
  await withCreditStore({}, async ({ landlord, credits }) => {
    const payment = { ...confirmedPayment(), status: 'failed' };
    const result = await creditLandlordForPayment(payment);

    assert.equal(result.status, 'PENDING');
    assert.equal(landlord.internalBalance, 0);
    assert.equal(credits.length, 0);
  });
});

test('paid tenant payment with no saved landlord account remains paid and gets a retryable pending credit', async () => {
  const landlord = { ...savedLandlord(), bankAccountName: '', bankAccountNumber: '', bankCode: '', bankAccountConfigured: false };
  await withCreditStore({ landlord }, async ({ credits }) => {
    const result = await creditLandlordForPayment(confirmedPayment());

    assert.equal(result.status, 'PENDING');
    assert.match(result.reason, /bank account is not configured/i);
    assert.equal(confirmedPayment().status, 'paid');
    assert.equal(landlord.internalBalance, 0);
    assert.equal(credits.length, 1);
    assert.equal(credits[0].status, 'PENDING');
  });
});

test('pending rent credit is applied once after the landlord saves a bank account', async () => {
  const landlord = {
    ...savedLandlord(),
    bankAccountName: '',
    bankAccountNumber: '',
    bankCode: '',
    bankAccountConfigured: false,
  };
  await withCreditStore({ landlord }, async ({ credits }) => {
    const payment = confirmedPayment();
    const pending = await creditLandlordForPayment(payment);
    assert.equal(pending.status, 'PENDING');
    assert.equal(landlord.internalBalance, 0);

    Object.assign(landlord, {
      bankAccountName: 'Landlord Account',
      bankAccountNumber: 'enc:v1:encrypted-account-number',
      bankCode: 'CBE',
      bankAccountConfigured: true,
    });
    const retried = await creditLandlordForPayment(payment);

    assert.equal(retried.status, 'CREDITED');
    assert.equal(landlord.internalBalance, 2000);
    assert.equal(credits.length, 1);
    assert.equal(credits[0].status, 'CREDITED');
  });
});

test('ledger schema enforces unique payment and provider transaction references', () => {
  assert.ok(LandlordCredit.schema.indexes().some(([fields, options]) =>
    fields.payment === 1 && options.unique === true
  ));
  assert.ok(LandlordCredit.schema.indexes().some(([fields, options]) =>
    fields.providerTransactionReference === 1 && options.unique === true
  ));
  assert.equal(User.schema.path('internalBalance').options.default, 0);
});
