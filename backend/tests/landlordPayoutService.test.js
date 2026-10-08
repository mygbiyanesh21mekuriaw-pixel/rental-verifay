const test = require('node:test');
const assert = require('node:assert/strict');
const LandlordCredit = require('../models/LandlordCredit');
const Payout = require('../models/Payout');
const User = require('../models/User');
const { encryptBankAccountNumber } = require('../utils/bankAccountCrypto');
const {
  getPayoutEligibilityFailure,
  processLandlordPayout,
  getVerifiedProviderReference,
  toExternalTransferStatus,
} = require('../services/landlordPayoutService');

const confirmedPayment = {
  _id: 'payment-id',
  tenant: 'tenant-id',
  landlord: 'landlord-id',
  property: 'property-id',
  amount: 3000,
  currency: 'ETB',
  paymentMode: 'live',
  paymentReference: 'RP-payment-id',
  provider: 'chapa',
  providerReference: 'RP-payment-id',
  providerTransactionReference: 'CHAPA-payment-transaction',
  status: 'paid',
  verifiedAt: new Date('2026-10-07T10:00:00.000Z'),
};

test('only live Chapa payout results are exposed as executed or failed bank transfers', () => {
  assert.equal(toExternalTransferStatus('PAID', 'live'), 'EXECUTED');
  assert.equal(toExternalTransferStatus('PROCESSING', 'live'), 'PENDING');
  assert.equal(toExternalTransferStatus('FAILED', 'live'), 'FAILED');
  assert.equal(toExternalTransferStatus('REVERTED', 'live'), 'FAILED');
  assert.equal(toExternalTransferStatus('PAID', 'sandbox'), 'NOT_EXECUTED');
  assert.equal(toExternalTransferStatus('PAID', undefined), 'NOT_EXECUTED');
});

test('only a matching payout reference from Chapa verification is exposed as the provider reference', () => {
  assert.equal(getVerifiedProviderReference({
    payoutReference: 'PO-match',
    providerReference: 'PO-match',
    providerVerificationResponse: { reference: 'PO-match' },
  }), 'PO-match');
  assert.equal(getVerifiedProviderReference({
    payoutReference: 'PO-local',
    providerReference: 'PO-local',
    providerVerificationResponse: { reference: 'PO-other' },
  }), null);
  assert.equal(getVerifiedProviderReference({
    payoutReference: 'PO-local',
    providerReference: 'PO-local',
  }), null);
});

test('explains payments which cannot be submitted because their mode is absent or mismatched', async () => {
  await withPayoutStore(async () => {
    assert.match(
      getPayoutEligibilityFailure({ ...confirmedPayment, paymentMode: undefined }),
      /payment mode was not recorded/i
    );
    assert.match(
      getPayoutEligibilityFailure({ ...confirmedPayment, paymentMode: 'sandbox' }),
      /configured for live mode/i
    );
    delete process.env.CHAPA_TRANSFER_APPROVAL_SECRET;
    assert.match(
      getPayoutEligibilityFailure(confirmedPayment, { checkTransferConfiguration: true }),
      /server approval is not configured/i
    );
  });
});

const withPayoutStore = async (
  run,
  { mode = 'live', testStatus = 'success', existingPayoutReference = '' } = {}
) => {
  const originals = {
    env: Object.fromEntries(
      ['PAYMENT_PROVIDER', 'PAYMENT_MODE', 'PAYMENT_SANDBOX', 'CHAPA_TRANSFER_TEST_STATUS', 'CHAPA_TRANSFER_TEST_ACCOUNT_NUMBER', 'CHAPA_SECRET_KEY', 'CHAPA_TRANSFER_APPROVAL_SECRET', 'CHAPA_BASE_URL', 'JWT_SECRET']
        .map((key) => [key, process.env[key]])
    ),
    fetch: global.fetch,
    payoutFindOne: Payout.findOne,
    payoutFindOneAndUpdate: Payout.findOneAndUpdate,
    payoutFindById: Payout.findById,
    userFindById: User.findById,
    userFindOneAndUpdate: User.findOneAndUpdate,
    creditFindOne: LandlordCredit.findOne,
    creditUpdateOne: LandlordCredit.updateOne,
  };
  process.env.PAYMENT_PROVIDER = 'chapa';
  process.env.PAYMENT_MODE = mode;
  process.env.PAYMENT_SANDBOX = String(mode === 'sandbox');
  process.env.CHAPA_TRANSFER_TEST_STATUS = testStatus;
  process.env.CHAPA_TRANSFER_TEST_ACCOUNT_NUMBER = 'CHAPA_TEST_ACCOUNT_FIXTURE';
  process.env.CHAPA_SECRET_KEY = 'test-only-secret';
  process.env.CHAPA_TRANSFER_APPROVAL_SECRET = 'test-only-approval-secret';
  process.env.CHAPA_BASE_URL = 'https://chapa.example.test';
  process.env.JWT_SECRET = 'test-only-encryption-secret';

  const landlord = {
    _id: 'landlord-id',
    bankAccountName: 'Landlord Example',
    bankAccountNumber: encryptBankAccountNumber('100123456789'),
    bankCode: '946',
    bankName: 'Commercial Bank of Ethiopia',
    bankAccountConfigured: true,
    bankAccountSource: 'existing_account',
    internalBalance: 3000,
    internalPayoutReferences: [],
  };
  const credit = { payment: 'payment-id', status: 'CREDITED', externalTransferStatus: 'NOT_EXECUTED' };
  let payout = existingPayoutReference ? {
    _id: 'payout-id',
    payment: confirmedPayment._id,
    tenant: confirmedPayment.tenant,
    landlord: confirmedPayment.landlord,
    property: confirmedPayment.property,
    amount: confirmedPayment.amount,
    currency: confirmedPayment.currency,
    mode,
    paymentReference: confirmedPayment.paymentReference,
    payoutReference: existingPayoutReference,
    status: 'PENDING',
  } : null;
  let verificationStatus = 'successful';
  let transferApiStatus = 'success';
  let transferRequestThrows = false;
  let transferFailureMessage = '';
  let verificationAmount = '3000.00';
  let verificationCurrency = 'ETB';
  let transferRequests = 0;
  const verifiedTransferReferences = [];
  let submittedAccountNumber = null;
  let submittedTransferBody = null;

  Payout.findOne = async () => payout;
  Payout.findOneAndUpdate = async (filter, update, options) => {
    if (options?.upsert && !payout) {
      payout = {
        _id: 'payout-id',
        ...update.$setOnInsert,
      };
      return payout;
    }
    if (filter.status === 'PENDING') {
      if (payout?.status !== 'PENDING') return null;
      Object.assign(payout, update.$set);
      return payout;
    }
    if (String(filter._id) === String(payout?._id)) {
      Object.assign(payout, update.$set);
      return payout;
    }
    return null;
  };
  Payout.findById = async () => payout;
  User.findById = () => ({ select: async () => landlord });
  User.findOneAndUpdate = async (filter, update) => {
    if (filter.internalBalance?.$gte !== undefined) {
      const alreadyReserved = landlord.internalPayoutReferences.some(
        (entry) => entry.payoutReference === update.$push.internalPayoutReferences.payoutReference
      );
      if (alreadyReserved || landlord.internalBalance < filter.internalBalance.$gte) return null;
      landlord.internalBalance += update.$inc.internalBalance;
      landlord.internalPayoutReferences.push(update.$push.internalPayoutReferences);
      return landlord;
    }
    const reservation = landlord.internalPayoutReferences.find(
      (entry) =>
        entry.payoutReference === filter.internalPayoutReferences.$elemMatch.payoutReference &&
        entry.status === 'RESERVED'
    );
    if (!reservation) return null;
    if (update.$set['internalPayoutReferences.$.status'] === 'EXECUTED') {
      reservation.status = 'EXECUTED';
      return landlord;
    }
    landlord.internalBalance += update.$inc.internalBalance;
    reservation.status = 'REFUNDED';
    return landlord;
  };
  LandlordCredit.findOne = async () => credit;
  LandlordCredit.updateOne = async (_filter, update) => {
    Object.assign(credit, update.$set);
  };
  global.fetch = async (url, options = {}) => {
    if (url.endsWith('/v1/banks')) {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          data: [{ bank_code: 946, bank_name: 'Commercial Bank of Ethiopia (CBE)' }],
        }),
      };
    }
    if (url.endsWith('/v1/transfers')) {
      transferRequests += 1;
      submittedTransferBody = JSON.parse(options.body);
      submittedAccountNumber = submittedTransferBody.account_number;
      if (transferRequestThrows) throw new Error('simulated network timeout');
      if (transferFailureMessage) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ status: 'error', message: transferFailureMessage }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: transferApiStatus,
          data: { reference: 'PO-test-123', status: 'processing' },
        }),
      };
    }
    if (url.includes('/v1/transfers/verify/')) {
      const reference = decodeURIComponent(url.split('/').pop());
      verifiedTransferReferences.push(reference);
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            reference,
            status: verificationStatus,
            amount: verificationAmount,
            currency: verificationCurrency,
          },
        }),
      };
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    await run({
      credit,
      landlord,
      getPayout: () => payout,
      setVerificationStatus: (status) => { verificationStatus = status; },
      setTransferApiStatus: (status) => { transferApiStatus = status; },
      setTransferRequestThrows: (value) => { transferRequestThrows = value; },
      setTransferFailureMessage: (message) => { transferFailureMessage = message; },
      setVerificationAmount: (amount) => { verificationAmount = amount; },
      setVerificationCurrency: (currency) => { verificationCurrency = currency; },
      getTransferRequests: () => transferRequests,
      getSubmittedAccountNumber: () => submittedAccountNumber,
      getSubmittedTransferBody: () => submittedTransferBody,
      getVerifiedTransferReferences: () => verifiedTransferReferences,
    });
  } finally {
    global.fetch = originals.fetch;
    Payout.findOne = originals.payoutFindOne;
    Payout.findOneAndUpdate = originals.payoutFindOneAndUpdate;
    Payout.findById = originals.payoutFindById;
    User.findById = originals.userFindById;
    User.findOneAndUpdate = originals.userFindOneAndUpdate;
    LandlordCredit.findOne = originals.creditFindOne;
    LandlordCredit.updateOne = originals.creditUpdateOne;
    for (const [key, value] of Object.entries(originals.env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('verified landlord credit uses its established payout reference and only executes after transfer verification', async () => {
  await withPayoutStore(async (store) => {
    const result = await processLandlordPayout(confirmedPayment);

    assert.equal(result.status, 'PAID');
    assert.equal(result.providerReference, 'PO-test-123');
    assert.equal(getVerifiedProviderReference(result), 'PO-test-123');
    assert.equal(store.credit.externalTransferStatus, 'EXECUTED');
    assert.equal(store.landlord.internalBalance, 0);
    assert.equal(store.landlord.internalPayoutReferences[0].status, 'EXECUTED');
    assert.equal(store.getSubmittedAccountNumber(), '100123456789');
    assert.equal(store.getSubmittedTransferBody().reference, 'PO-test-123');
    assert.deepEqual(store.getVerifiedTransferReferences(), ['PO-test-123']);
    assert.equal(store.getPayout().payoutReference, 'PO-test-123');
    assert.equal(store.getTransferRequests(), 1);

    await processLandlordPayout(confirmedPayment);
    assert.equal(store.getTransferRequests(), 1);
    assert.equal(store.landlord.internalBalance, 0);
  }, { existingPayoutReference: 'PO-test-123' });
});

test('an ambiguous transfer response is not treated as failed or executed without verification', async () => {
  await withPayoutStore(async (store) => {
    store.setTransferRequestThrows(true);
    store.setVerificationStatus('pending');

    const result = await processLandlordPayout(confirmedPayment);

    assert.equal(result.status, 'PROCESSING');
    assert.equal(result.providerReference, undefined);
    assert.equal(store.credit.externalTransferStatus, 'PENDING');
    assert.equal(store.landlord.internalBalance, 0);
    assert.equal(store.landlord.internalPayoutReferences[0].status, 'RESERVED');
    assert.equal(store.getTransferRequests(), 1);
  });
});

test('legacy payments without a recorded mode are not automatically paid out', async () => {
  await withPayoutStore(async (store) => {
    const legacyResult = await processLandlordPayout({
      ...confirmedPayment,
      paymentMode: undefined,
    });

    assert.equal(legacyResult, null);
    assert.equal(store.getPayout(), null);
    assert.equal(store.getTransferRequests(), 0);
    assert.equal(store.landlord.internalBalance, 3000);
  });
});

test('live payout is held pending until Chapa server approval is configured', async () => {
  await withPayoutStore(async (store) => {
    delete process.env.CHAPA_TRANSFER_APPROVAL_SECRET;
    const result = await processLandlordPayout(confirmedPayment);

    assert.equal(result.status, 'PENDING');
    assert.match(result.failureReason, /server-approval is not configured/i);
    assert.equal(store.credit.externalTransferStatus, 'NOT_EXECUTED');
    assert.equal(store.getTransferRequests(), 0);
    assert.equal(store.landlord.internalBalance, 3000);
  });
});

test('sandbox uses Chapa test transfer behavior without claiming real execution', async () => {
  await withPayoutStore(async (store) => {
    const result = await processLandlordPayout({
      ...confirmedPayment,
      paymentMode: 'sandbox',
    });

    assert.equal(result.status, 'SIMULATED');
    assert.equal(result.sandboxTransferStatus, 'SUCCEEDED');
    assert.equal(store.credit.externalTransferStatus, 'NOT_EXECUTED');
    assert.equal(store.credit.sandboxTransferStatus, 'SUCCEEDED');
    assert.match(result.failureReason, /no real bank funds were moved/i);
    assert.equal(store.landlord.internalBalance, 3000);
    assert.equal(store.landlord.internalPayoutReferences.length, 0);
    assert.equal(store.getSubmittedTransferBody().account_name, 'Landlord Example');
    assert.equal(store.getSubmittedTransferBody().account_number, 'CHAPA_TEST_ACCOUNT_FIXTURE');
    assert.equal(store.getSubmittedTransferBody().bank_code, 946);
    assert.equal(store.getSubmittedTransferBody().amount, '3000.00');
    assert.equal(store.getSubmittedTransferBody().status, 'success');
    assert.equal(store.getTransferRequests(), 1);

    await processLandlordPayout({
      ...confirmedPayment,
      paymentMode: 'sandbox',
    });
    assert.equal(store.getTransferRequests(), 1);
    assert.equal(store.landlord.internalBalance, 3000);
  }, { mode: 'sandbox', testStatus: 'success' });
});

  test('sandbox payout will not submit the saved landlord account without a Chapa test destination', async () => {
    await withPayoutStore(async (store) => {
      delete process.env.CHAPA_TRANSFER_TEST_ACCOUNT_NUMBER;
      const result = await processLandlordPayout({
        ...confirmedPayment,
        paymentMode: 'sandbox',
      });

      assert.equal(result.status, 'PENDING');
      assert.match(result.failureReason, /CHAPA_TRANSFER_TEST_ACCOUNT_NUMBER.*test destination supplied by Chapa/i);
      assert.equal(store.getTransferRequests(), 0);
      assert.equal(store.getSubmittedAccountNumber(), null);
      assert.equal(store.credit.externalTransferStatus, 'NOT_EXECUTED');
    }, { mode: 'sandbox' });
  });

  test('a rejected sandbox transfer remains a non-executed simulation and preserves the Chapa error', async () => {
  await withPayoutStore(async (store) => {
    store.setTransferFailureMessage('Invalid sandbox destination account');
    const result = await processLandlordPayout({
      ...confirmedPayment,
      paymentMode: 'sandbox',
    });

    assert.equal(result.status, 'SIMULATED');
    assert.equal(result.sandboxTransferStatus, 'FAILED');
    assert.equal(store.credit.externalTransferStatus, 'NOT_EXECUTED');
    assert.equal(result.providerRequestResponse.message, 'Invalid sandbox destination account');
    assert.match(result.failureReason, /Invalid sandbox destination account/i);
    assert.equal(store.getSubmittedTransferBody().status, 'success');
    assert.equal(store.getTransferRequests(), 1);
    assert.equal(store.landlord.internalBalance, 3000);
  }, { mode: 'sandbox', testStatus: 'success' });
});

test('sandbox pending transfer is verified on retry without duplicate submission', async () => {
  await withPayoutStore(async (store) => {
    store.setVerificationStatus('pending');
    const pending = await processLandlordPayout({
      ...confirmedPayment,
      paymentMode: 'sandbox',
    });
    assert.equal(pending.status, 'PROCESSING');
    assert.equal(store.credit.externalTransferStatus, 'NOT_EXECUTED');
    assert.equal(store.credit.sandboxTransferStatus, 'PROCESSING');
    assert.equal(store.getTransferRequests(), 1);

    store.setVerificationStatus('successful');
    const resolved = await processLandlordPayout({
      ...confirmedPayment,
      paymentMode: 'sandbox',
    });
    assert.equal(resolved.status, 'SIMULATED');
    assert.equal(resolved.sandboxTransferStatus, 'SUCCEEDED');
    assert.equal(store.getTransferRequests(), 1);
  }, { mode: 'sandbox', testStatus: 'pending' });
});

test('an explicit Chapa payout rejection is recorded as FAILED with the provider message', async () => {
  await withPayoutStore(async (store) => {
    store.setTransferApiStatus('error');
    const result = await processLandlordPayout(confirmedPayment);

    assert.equal(result.status, 'FAILED');
    assert.equal(result.providerReference, undefined);
    assert.match(result.failureReason, /Chapa transfer request failed/i);
    assert.equal(store.credit.externalTransferStatus, 'FAILED');
    assert.equal(store.landlord.internalBalance, 3000);
    assert.equal(store.landlord.internalPayoutReferences[0].status, 'REFUNDED');
  });
});

test('Chapa rejects an invalid landlord bank account without claiming execution', async () => {
  await withPayoutStore(async (store) => {
    store.setTransferFailureMessage('Invalid bank account number');
    const result = await processLandlordPayout(confirmedPayment);

    assert.equal(result.status, 'FAILED');
    assert.match(result.failureReason, /Invalid bank account number/i);
    assert.equal(store.credit.externalTransferStatus, 'FAILED');
    assert.equal(store.landlord.internalBalance, 3000);
    assert.equal(store.landlord.internalPayoutReferences[0].status, 'REFUNDED');
  });
});

test('unknown transfer outcome stays pending and is verified without a duplicate request', async () => {
  await withPayoutStore(async (store) => {
    store.setTransferRequestThrows(true);
    const pending = await processLandlordPayout(confirmedPayment);
    assert.equal(pending.status, 'PROCESSING');
    assert.equal(store.credit.externalTransferStatus, 'PENDING');
    assert.match(pending.failureReason, /simulated network timeout/i);
    assert.equal(store.getTransferRequests(), 1);

    store.setTransferRequestThrows(false);
    store.setVerificationStatus('successful');
    const resolved = await processLandlordPayout(confirmedPayment);
    assert.equal(resolved.status, 'PAID');
    assert.equal(store.credit.externalTransferStatus, 'EXECUTED');
    assert.equal(store.getTransferRequests(), 1);
  });
});

test('pending Chapa transfer is verified on retry without submitting a duplicate transfer', async () => {
  await withPayoutStore(async (store) => {
    store.setVerificationStatus('pending');
    const pending = await processLandlordPayout(confirmedPayment);
    assert.equal(pending.status, 'PROCESSING');
    assert.equal(store.credit.externalTransferStatus, 'PENDING');
    assert.match(pending.failureReason, /pending confirmation/i);
    assert.equal(store.landlord.internalBalance, 0);
    assert.equal(store.getTransferRequests(), 1);

    store.setVerificationStatus('successful');
    const confirmed = await processLandlordPayout(confirmedPayment);
    assert.equal(confirmed.status, 'PAID');
    assert.equal(store.credit.externalTransferStatus, 'EXECUTED');
    assert.equal(store.getTransferRequests(), 1);
  });
});

test('transfer verification does not execute a payout when Chapa returns the wrong amount or currency', async () => {
  await withPayoutStore(async (store) => {
    store.setVerificationAmount('2999.00');
    const result = await processLandlordPayout(confirmedPayment);

    assert.equal(result.status, 'PROCESSING');
    assert.equal(store.credit.externalTransferStatus, 'PENDING');
    assert.match(result.failureReason, /amount.*does not match/i);
    assert.equal(store.landlord.internalPayoutReferences[0].status, 'RESERVED');
    assert.equal(store.getTransferRequests(), 1);
  });
});

test('provider-confirmed failed transfer releases the reserved landlord balance', async () => {
  await withPayoutStore(async (store) => {
    store.setVerificationStatus('failed');
    const failed = await processLandlordPayout(confirmedPayment);

    assert.equal(failed.status, 'FAILED');
    assert.equal(store.credit.externalTransferStatus, 'FAILED');
    assert.equal(store.landlord.internalBalance, 3000);
    assert.equal(store.landlord.internalPayoutReferences[0].status, 'REFUNDED');
    assert.equal(store.getTransferRequests(), 1);
  });
});
