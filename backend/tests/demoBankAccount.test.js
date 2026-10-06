const test = require('node:test');
const assert = require('node:assert/strict');
const DemoBankAccount = require('../models/DemoBankAccount');
const DemoBankAccountSequence = require('../models/DemoBankAccountSequence');
const {
  DEMO_BANKS,
  createDemoBankAccount,
  creditDemoAccountForPayment,
  formatDemoAccountNumber,
  getDemoBank,
  isConfirmedPayment,
} = require('../services/demoBankAccountService');

test('only the configured internal demo banks are accepted', () => {
  assert.deepEqual(DEMO_BANKS.map(({ code }) => code), [
    'CBE',
    'AWASH',
    'CBO',
    'HIBRET',
    'ZEMEN',
    'MPESA',
    'YAYA',
    'TELEBIRR',
  ]);
  assert.equal(getDemoBank('cbe').name, 'Commercial Bank of Ethiopia (CBE)');
  assert.equal(getDemoBank('unsupported'), undefined);
});

test('configured demo account numbers are numeric and match each bank exact length', () => {
  assert.deepEqual(
    Object.fromEntries(DEMO_BANKS.map(({ code, accountNumberLength }) => [code, accountNumberLength])),
    {
      CBE: 13,
      AWASH: 14,
      CBO: 12,
      HIBRET: 11,
      ZEMEN: 12,
      MPESA: 10,
      YAYA: 10,
      TELEBIRR: 10,
    }
  );

  for (const bank of DEMO_BANKS) {
    const accountNumber = formatDemoAccountNumber(bank.code, 123);
    assert.match(accountNumber, /^\d+$/);
    assert.equal(accountNumber.length, bank.accountNumberLength);
    assert.equal(bank.accountNumberFormat, 'numeric');
  }

  assert.equal(formatDemoAccountNumber('CBE', 1), '1000000000001');
  assert.equal(formatDemoAccountNumber('CBE', 297000307), '1000297000307');
  assert.ok(formatDemoAccountNumber('CBE', 1).startsWith('100'));
  assert.equal(formatDemoAccountNumber('CBE', 9999999999).length, 13);
  assert.throws(
    () => formatDemoAccountNumber('CBE', 10000000000),
    { code: 'DEMO_ACCOUNT_NUMBER_CAPACITY_EXCEEDED' }
  );
  assert.equal(formatDemoAccountNumber('AWASH', 1), '00000000000001');
  assert.equal(DEMO_BANKS.find(({ code }) => code === 'CBE').accountNumberPrefix, '100');
  assert.equal(DEMO_BANKS.find(({ code }) => code === 'AWASH').accountNumberLength, 14);
  assert.throws(
    () => formatDemoAccountNumber('AWASH', 100000000000000),
    { code: 'DEMO_ACCOUNT_NUMBER_CAPACITY_EXCEEDED' }
  );
});

test('models enforce one account per landlord and unique account numbers', () => {
  assert.equal(DemoBankAccount.schema.path('landlord').options.unique, true);
  assert.equal(DemoBankAccount.schema.path('accountNumber').options.unique, true);
  const validateAccountNumber = DemoBankAccount.schema.path('accountNumber').options.validate.validator;
  assert.equal(validateAccountNumber.call({ bankCode: 'AWASH' }, '01300123456789'), true);
  assert.equal(validateAccountNumber.call({ bankCode: 'AWASH' }, '0130012345678A'), false);
  assert.equal(validateAccountNumber.call({ bankCode: 'AWASH' }, '1234'), false);
  assert.equal(DemoBankAccount.schema.path('balance').options.default, 0);
  assert.equal(DemoBankAccountSequence.schema.path('sequence').options.default, 0);
  assert.ok(DemoBankAccount.schema.path('credits').schema.path('payment'));
});

test('only a confirmed Chapa rent payment may be credited to the virtual account', () => {
  const payment = {
    _id: 'payment-id',
    status: 'paid',
    verifiedAt: new Date(),
    provider: 'chapa',
    paymentReference: 'RP-reference',
    providerReference: 'RP-reference',
    providerTransactionReference: 'CHAPA-transaction',
    amount: 5000,
  };
  assert.equal(isConfirmedPayment(payment), true);
  assert.equal(isConfirmedPayment({ ...payment, verifiedAt: null }), false);
  assert.equal(isConfirmedPayment({ ...payment, status: 'pending' }), false);
  assert.equal(isConfirmedPayment({ ...payment, providerTransactionReference: '' }), false);
});

test('account creation uses the atomic sequence and returns the same landlord account on repeat', async () => {
  const originalFindOne = DemoBankAccount.findOne;
  const originalCreate = DemoBankAccount.create;
  const originalFindOneAndUpdate = DemoBankAccountSequence.findOneAndUpdate;
  let storedAccount = null;
  let sequence = 0;
  let sequenceId;
  DemoBankAccount.findOne = async () => storedAccount;
  DemoBankAccount.create = async (records) => {
    storedAccount = { _id: 'demo-id', ...records[0] };
    return [storedAccount];
  };
  DemoBankAccountSequence.findOneAndUpdate = async (filter) => {
    sequenceId = filter._id;
    return { sequence: ++sequence };
  };

  try {
    const first = await createDemoBankAccount({
      landlordId: 'landlord-id',
      accountName: 'Dejen Mulat',
      bankCode: 'CBE',
    });
    const second = await createDemoBankAccount({
      landlordId: 'landlord-id',
      accountName: 'Changed Name',
      bankCode: 'AWASH',
    });

    assert.equal(first.created, true);
    assert.equal(first.account.accountNumber, '1000000000001');
    assert.equal(sequenceId, 'demo-account-CBE');
    assert.equal(second.created, false);
    assert.equal(second.account._id, first.account._id);
    assert.equal(sequence, 1);
  } finally {
    DemoBankAccount.findOne = originalFindOne;
    DemoBankAccount.create = originalCreate;
    DemoBankAccountSequence.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('reprocessing a confirmed payment credits a demo balance only once', async () => {
  const originals = {
    findOne: DemoBankAccount.findOne,
    findById: DemoBankAccount.findById,
    findOneAndUpdate: DemoBankAccount.findOneAndUpdate,
  };
  const account = {
    _id: 'account-id',
    landlord: 'landlord-id',
    balance: 0,
    status: 'active',
    credits: [],
  };
  DemoBankAccount.findOne = async () => account;
  DemoBankAccount.findById = async () => account;
  DemoBankAccount.findOneAndUpdate = async (filter, update) => {
    const alreadyCredited = account.credits.some(
      (credit) => String(credit.payment) === String(update.$push.credits.payment)
    );
    if (alreadyCredited) return null;

    account.balance += update.$inc.balance;
    account.credits.push({ ...update.$push.credits });
    return account;
  };
  const payment = {
    _id: 'payment-id',
    landlord: 'landlord-id',
    tenant: 'tenant-id',
    property: 'property-id',
    amount: 5000,
    currency: 'ETB',
    status: 'paid',
    provider: 'chapa',
    paymentReference: 'RP-001',
    providerReference: 'RP-001',
    providerTransactionReference: 'CHAPA-001',
    verifiedAt: new Date(),
  };

  try {
    const first = await creditDemoAccountForPayment(payment);
    const duplicate = await creditDemoAccountForPayment(payment);
    assert.equal(first.credited, true);
    assert.equal(first.alreadyCredited, false);
    assert.equal(duplicate.alreadyCredited, true);
    assert.equal(account.balance, 5000);
    assert.equal(account.credits.length, 1);
  } finally {
    DemoBankAccount.findOne = originals.findOne;
    DemoBankAccount.findById = originals.findById;
    DemoBankAccount.findOneAndUpdate = originals.findOneAndUpdate;
  }
});
