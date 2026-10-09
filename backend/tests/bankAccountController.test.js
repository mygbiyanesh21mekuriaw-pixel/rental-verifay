const test = require('node:test');
const assert = require('node:assert/strict');
const DemoBankAccount = require('../models/DemoBankAccount');
const LandlordCredit = require('../models/LandlordCredit');
const Payout = require('../models/Payout');
const Payment = require('../models/Payment');
const User = require('../models/User');
const {
  decryptBankAccountNumber,
  encryptBankAccountNumber,
} = require('../utils/bankAccountCrypto');
const {
  createLandlordBankAccount,
  getMyDemoAccount,
  getMyBankAccount,
  getMyBankTransactions,
  getSupportedBanks,
  retryMyPayoutVerification,
} = require('../controllers/bankAccountController');
const { auth } = require('../middleware/auth');

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const withChapaBanks = async (run) => {
  const originalFetch = global.fetch;
  const envKeys = ['PAYMENT_PROVIDER', 'CHAPA_SECRET_KEY', 'CHAPA_BASE_URL'];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.PAYMENT_PROVIDER = 'chapa';
  process.env.CHAPA_SECRET_KEY = 'test-only-secret';
  process.env.CHAPA_BASE_URL = 'https://chapa.example.test';
  global.fetch = async (url) => {
    assert.equal(url, 'https://chapa.example.test/v1/banks');
    return {
      ok: true,
      json: async () => ({
        status: 'success',
        data: [
          { bank_code: 'CBE', bank_name: 'Commercial Bank of Ethiopia (CBE)' },
          { bank_code: 'AWASH', bank_name: 'Awash Bank' },
        ],
      }),
    };
  };

  try {
    await run();
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
};

test('account lookup succeeds with a null account when landlord has not created one', async () => {
  const originalFindOne = DemoBankAccount.findOne;
  let query;
  DemoBankAccount.findOne = async (filter) => {
    query = filter;
    return null;
  };
  const response = createResponse();

  try {
    await getMyDemoAccount(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.deepEqual(query, { landlord: 'landlord-id', status: 'active' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { success: true, account: null });
  } finally {
    DemoBankAccount.findOne = originalFindOne;
  }
});

test('account lookup returns the active landlord account in the success response', async () => {
  const originalFindOne = DemoBankAccount.findOne;
  DemoBankAccount.findOne = async () => ({
    _id: 'account-id',
    bankName: 'Commercial Bank of Ethiopia (CBE)',
    bankCode: 'CBE',
    accountName: 'Dejen Mulat',
    accountNumber: '1000000000001',
    balance: 0,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const response = createResponse();

  try {
    await getMyDemoAccount(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.account.accountNumber, '1000000000001');
    assert.equal(response.body.account.bankCode, 'CBE');
  } finally {
    DemoBankAccount.findOne = originalFindOne;
  }
});

test('bank registration options use bank codes supported by Chapa payouts', async () => {
  await withChapaBanks(async () => {
    const response = createResponse();

    await getSupportedBanks(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.banks, [
      { name: 'Commercial Bank of Ethiopia (CBE)', code: 'CBE', slug: '' },
      { name: 'Awash Bank', code: 'AWASH', slug: '' },
    ]);
  });
});

test('real account lookup returns null for a landlord with no saved bank account', async () => {
  const originalFindById = User.findById;
  const originalPaymentFind = Payment.find;
  Payment.find = async () => [];
  User.findById = () => ({
    select: async () => ({
      _id: 'landlord-id',
      bankName: '',
      bankCode: '',
      bankAccountName: '',
      bankAccountNumber: '',
      bankAccountConfigured: false,
    }),
  });
  const response = createResponse();

  try {
    await getMyBankAccount(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { success: true, account: null });
  } finally {
    User.findById = originalFindById;
    Payment.find = originalPaymentFind;
  }
});

test('real account lookup asks the landlord to re-enter an undecryptable saved number', async () => {
  const originalFindById = User.findById;
  const originalPaymentFind = Payment.find;
  const previousEncryptionKey = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  const originalConsoleError = console.error;
  const loggedMessages = [];
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'old-bank-encryption-key';
  const encryptedNumber = encryptBankAccountNumber('001234567890');
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'new-bank-encryption-key';
  Payment.find = async () => [];
  User.findById = () => ({
    select: async () => ({
      _id: 'landlord-id',
      role: 'landlord',
      bankName: 'Example Bank',
      bankCode: 'EXAMPLE',
      bankAccountName: 'Dejen',
      bankAccountNumber: encryptedNumber,
      bankAccountConfigured: true,
    }),
  });
  console.error = (...args) => loggedMessages.push(args.join(' '));
  const response = createResponse();

  try {
    await getMyBankAccount(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.account.bankAccountConfigured, false);
    assert.equal(response.body.account.bankAccountNeedsUpdate, true);
    assert.equal(response.body.account.accountNumberMasked, '');
    assert.match(loggedMessages[0], /must enter it again/);
  } finally {
    User.findById = originalFindById;
    Payment.find = originalPaymentFind;
    console.error = originalConsoleError;
    if (previousEncryptionKey === undefined) delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
    else process.env.BANK_ACCOUNT_ENCRYPTION_KEY = previousEncryptionKey;
  }
});

test('saves landlord bank details encrypted on the authenticated landlord and only returns a mask', async () => {
  const originalFindById = User.findById;
  const originalPaymentFind = Payment.find;
  Payment.find = async () => [];
  const previousEncryptionKey = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  const landlord = {
    _id: 'landlord-id',
    role: 'landlord',
    async save() {},
  };
  let queriedLandlordId;
  User.findById = (id) => {
    queriedLandlordId = id;
    return { select: async () => landlord };
  };
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'test-only-bank-account-encryption-key';
  const response = createResponse();

  try {
    await withChapaBanks(async () => {
      await createLandlordBankAccount(
        {
          user: { id: 'landlord-id', role: 'landlord' },
          body: {
            bankCode: 'CBE',
            bankName: 'client-provided name is ignored',
            accountName: 'Dejen Mulat',
            accountNumber: '100123456789',
          },
        },
        response
      );

      assert.equal(response.statusCode, 200);
      assert.equal(queriedLandlordId, 'landlord-id');
      assert.equal(landlord.bankName, 'Commercial Bank of Ethiopia (CBE)');
      assert.equal(landlord.bankCode, 'CBE');
      assert.equal(landlord.bankAccountName, 'Dejen Mulat');
      assert.notEqual(landlord.bankAccountNumber, '100123456789');
      assert.match(landlord.bankAccountNumber, /^enc:v1:/);
      assert.equal(landlord.bankAccountSource, 'existing_account');
      assert.equal(landlord.bankAccountConfigured, true);
      assert.equal(response.body.account.accountNumberMasked, '********6789');
      assert.equal(Object.hasOwn(response.body.account, 'accountNumber'), false);
    });
  } finally {
    User.findById = originalFindById;
    Payment.find = originalPaymentFind;
    if (previousEncryptionKey === undefined) {
      delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
    } else {
      process.env.BANK_ACCOUNT_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
});

test('account update keeps the encrypted account number when no replacement is supplied', async () => {
  const originalFindById = User.findById;
  const originalPaymentFind = Payment.find;
  Payment.find = async () => [];
  const previousEncryptionKey = process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
  process.env.BANK_ACCOUNT_ENCRYPTION_KEY = 'test-only-bank-account-encryption-key';
  const { encryptBankAccountNumber } = require('../utils/bankAccountCrypto');
  const originalEncryptedNumber = encryptBankAccountNumber('100123456789');
  const landlord = {
    _id: 'landlord-id',
    role: 'landlord',
    internalBalance: 37000,
    internalCreditReferences: [{ payment: 'existing-payment', amount: 1000 }],
    internalPayoutReferences: [{
      payoutReference: 'PO-existing',
      amount: 1000,
      status: 'RESERVED',
    }],
    bankAccountNumber: originalEncryptedNumber,
    async save() {},
  };
  User.findById = () => ({ select: async () => landlord });
  const response = createResponse();

  try {
    await withChapaBanks(async () => {
      await createLandlordBankAccount(
        {
          user: { id: 'landlord-id', role: 'landlord' },
          body: {
            bankCode: 'AWASH',
            accountName: 'Updated Name',
          },
        },
        response
      );

      assert.equal(response.statusCode, 200);
      assert.equal(landlord.bankCode, 'AWASH');
      assert.equal(landlord.bankAccountName, 'Updated Name');
      assert.equal(landlord.bankAccountNumber, originalEncryptedNumber);
      assert.equal(decryptBankAccountNumber(landlord.bankAccountNumber), '100123456789');
      assert.equal(landlord.internalBalance, 37000);
      assert.deepEqual(landlord.internalCreditReferences, [{ payment: 'existing-payment', amount: 1000 }]);
      assert.deepEqual(landlord.internalPayoutReferences, [{
        payoutReference: 'PO-existing',
        amount: 1000,
        status: 'RESERVED',
      }]);
      assert.equal(response.body.account.accountNumberMasked, '********6789');
    });
  } finally {
    User.findById = originalFindById;
    Payment.find = originalPaymentFind;
    if (previousEncryptionKey === undefined) {
      delete process.env.BANK_ACCOUNT_ENCRYPTION_KEY;
    } else {
      process.env.BANK_ACCOUNT_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
});

test('landlord transaction lookup returns internal balance and transaction references', async () => {
  const originals = {
    findById: User.findById,
    paymentFindById: Payment.findById,
    findPayments: Payment.find,
    findCredits: LandlordCredit.find,
    findPayouts: Payout.find,
  };
  const transaction = {
    _id: 'credit-id',
    payment: 'payment-id',
    type: 'RENT_PAYMENT_CREDIT',
    amount: 2000,
    currency: 'ETB',
    status: 'CREDITED',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    creditedAt: new Date('2026-10-07T10:00:00.000Z'),
    paymentReference: 'RP-payment-id',
    providerTransactionReference: 'CHAPA-transaction-id',
    externalTransferStatus: 'NOT_EXECUTED',
    tenant: { name: 'Tenant Example' },
    property: { title: 'Rental Home' },
  };
  User.findById = () => ({ select: async () => ({ internalBalance: 2000 }) });
  Payment.findById = async () => ({
    _id: 'payment-id',
    status: 'pending',
    paymentPeriod: '2026-10',
  });
  Payment.find = async () => [];
  LandlordCredit.find = () => {
    const query = {
      populate: () => query,
      select: async () => [{ payment: 'payment-id' }],
      sort: async () => [transaction],
    };
    return query;
  };
  Payout.find = () => ({
    select: async () => [{
      payment: 'payment-id',
      status: 'PROCESSING',
      mode: 'live',
      payoutReference: 'PO-payment-id',
      providerReference: 'PO-payment-id',
      providerVerificationResponse: { reference: 'PO-payment-id' },
      failureReason: '',
    }],
  });
  const response = createResponse();

  try {
    await getMyBankTransactions(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.balance, 2000);
    assert.equal(response.body.transactions[0].status, 'CREDITED');
    assert.equal(response.body.transactions[0].providerTransactionReference, 'CHAPA-transaction-id');
    assert.equal(response.body.transactions[0].paymentPeriod, '2026-10');
    assert.equal(response.body.transactions[0].externalTransferStatus, 'PENDING');
    assert.equal(response.body.transactions[0].payoutReference, 'PO-payment-id');
    assert.equal(response.body.transactions[0].transferReference, 'PO-payment-id');
    assert.equal(response.body.transactions[0].chapaTransferReference, 'PO-payment-id');
    assert.equal(response.body.transactions[0].providerReference, 'PO-payment-id');
    assert.equal(response.body.transactions[0].tenant, 'Tenant Example');
    assert.equal(response.body.transactions[0].property, 'Rental Home');
  } finally {
    User.findById = originals.findById;
    Payment.findById = originals.paymentFindById;
    Payment.find = originals.findPayments;
    LandlordCredit.find = originals.findCredits;
    Payout.find = originals.findPayouts;
  }
});

test('retry endpoint returns an explicit sandbox-unconfirmed result and preserves the provider reference', async () => {
  const originals = {
    env: Object.fromEntries(
      ['PAYMENT_PROVIDER', 'PAYMENT_MODE', 'PAYMENT_SANDBOX', 'CHAPA_SECRET_KEY', 'CHAPA_BASE_URL']
        .map((key) => [key, process.env[key]])
    ),
    fetch: global.fetch,
    payoutFindOne: Payout.findOne,
    payoutFindOneAndUpdate: Payout.findOneAndUpdate,
    payoutFindById: Payout.findById,
    creditUpdateOne: LandlordCredit.updateOne,
  };
  Object.assign(process.env, {
    PAYMENT_PROVIDER: 'chapa',
    PAYMENT_MODE: 'sandbox',
    PAYMENT_SANDBOX: 'true',
    CHAPA_SECRET_KEY: 'test-only-secret',
    CHAPA_BASE_URL: 'https://chapa.example.test',
  });
  const payout = {
    _id: 'payout-id',
    payment: 'payment-id',
    landlord: 'landlord-id',
    amount: 4000,
    currency: 'ETB',
    mode: 'sandbox',
    payoutReference: 'PO-internal-reference',
    providerReference: 'APQfhhNqwnvoZ',
    status: 'PROCESSING',
    transferAttemptedAt: new Date(),
    providerRequestResponse: { reference: 'APQfhhNqwnvoZ', httpStatus: 200, apiStatus: 'success' },
  };
  Payout.findOne = async (query) => {
    assert.equal(query.landlord, 'landlord-id');
    assert.ok(query.$or.some((condition) => condition.providerReference === 'APQfhhNqwnvoZ'));
    return payout;
  };
  Payout.findOneAndUpdate = async (_filter, update) => {
    Object.assign(payout, update.$set);
    return payout;
  };
  Payout.findById = async () => payout;
  LandlordCredit.updateOne = async () => ({ acknowledged: true });
  global.fetch = async (url) => {
    assert.equal(url, 'https://chapa.example.test/v1/transfers/verify/APQfhhNqwnvoZ');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'Transfer details (Test Mode)',
        data: { status: 'success' },
      }),
    };
  };
  const response = createResponse();

  try {
    await retryMyPayoutVerification(
      {
        params: { reference: 'APQfhhNqwnvoZ' },
        user: { id: 'landlord-id', role: 'landlord' },
      },
      response
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.transaction.verificationOutcome, 'sandbox_unconfirmed');
    assert.equal(response.body.transaction.transferReference, 'APQfhhNqwnvoZ');
    assert.equal(response.body.transaction.externalTransferStatus, 'NOT_EXECUTED');
    assert.equal(response.body.transaction.payoutFailureReason.includes('amount was omitted'), true);
    assert.equal(payout.status, 'PROCESSING');
  } finally {
    global.fetch = originals.fetch;
    Payout.findOne = originals.payoutFindOne;
    Payout.findOneAndUpdate = originals.payoutFindOneAndUpdate;
    Payout.findById = originals.payoutFindById;
    LandlordCredit.updateOne = originals.creditUpdateOne;
    for (const [key, value] of Object.entries(originals.env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('retry endpoint enforces landlord access and reports missing payouts with structured errors', async () => {
  const originalFindOne = Payout.findOne;
  Payout.findOne = async () => null;
  const response = createResponse();

  try {
    await retryMyPayoutVerification(
      { params: { reference: 'APQfhhNqwnvoZ' }, user: { id: 'tenant-id', role: 'tenant' } },
      response
    );
    assert.equal(response.statusCode, 403);
    assert.match(response.body.message, /only landlords/i);

    const missingResponse = createResponse();
    await retryMyPayoutVerification(
      { params: { reference: 'APQfhhNqwnvoZ' }, user: { id: 'landlord-id', role: 'landlord' } },
      missingResponse
    );
    assert.equal(missingResponse.statusCode, 404);
    assert.equal(missingResponse.body.error.code, 'PAYOUT_NOT_FOUND');
    assert.match(missingResponse.body.error.message, /no existing payout/i);

    const authResponse = createResponse();
    auth({ header: () => undefined }, authResponse, () => {
      assert.fail('Unauthenticated retry requests must not reach the route handler.');
    });
    assert.equal(authResponse.statusCode, 401);
    assert.match(authResponse.body.message, /no token/i);
  } finally {
    Payout.findOne = originalFindOne;
  }
});
