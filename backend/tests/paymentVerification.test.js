const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateChapaPaymentVerification,
} = require('../utils/paymentProvider');
const {
  verifyChapaTransfer,
} = require('../utils/payoutProvider');

const expectedPayment = {
  paymentReference: 'RP-test-123',
  amount: 2500,
  currency: 'ETB',
};

const validVerification = {
  ok: true,
  apiStatus: 'success',
  providerStatus: 'paid',
  amount: '2500.00',
  currency: 'ETB',
  providerReference: expectedPayment.paymentReference,
  providerTransactionReference: 'CHAPA-ref-456',
};

test('accepts successful payment only with matching reference, amount, currency, and transaction reference', () => {
  assert.deepEqual(
    validateChapaPaymentVerification(validVerification, expectedPayment),
    { ok: true, status: 'paid' }
  );
});

test('does not accept missing Chapa amount, currency, or transaction reference', () => {
  for (const field of ['amount', 'currency', 'providerTransactionReference']) {
    const verification = { ...validVerification };
    delete verification[field];
    assert.equal(validateChapaPaymentVerification(verification, expectedPayment).ok, false, field);
  }
});

test('does not accept invalid references or a wrong verified amount', () => {
  assert.equal(validateChapaPaymentVerification({
    ...validVerification,
    providerReference: 'RP-someone-elses-payment',
  }, expectedPayment).ok, false);
  assert.equal(validateChapaPaymentVerification({
    ...validVerification,
    providerTransactionReference: 'CHAPA-other-transaction',
  }, {
    ...expectedPayment,
    providerTransactionReference: 'CHAPA-ref-456',
  }).ok, false);
  assert.equal(validateChapaPaymentVerification({
    ...validVerification,
    amount: '2499.99',
  }, expectedPayment).ok, false);
});

test('failed and cancelled provider results are final but are never classified as paid', () => {
  for (const status of ['failed', 'cancelled']) {
    assert.deepEqual(
      validateChapaPaymentVerification({
        ...validVerification,
        providerStatus: status,
      }, expectedPayment),
      { ok: true, status }
    );
  }
});

test('does not accept an unconfirmed API response or a non-final Chapa status', () => {
  assert.equal(validateChapaPaymentVerification({
    ...validVerification,
    apiStatus: 'error',
  }, expectedPayment).ok, false);
  assert.equal(validateChapaPaymentVerification({
    ...validVerification,
    providerStatus: 'pending',
  }, expectedPayment).ok, false);
});

test('payout is PAID only when Chapa confirms the requested transfer reference', async () => {
  const originalFetch = global.fetch;
  const previousProvider = process.env.PAYMENT_PROVIDER;
  const previousSecret = process.env.CHAPA_SECRET_KEY;
  const previousBaseUrl = process.env.CHAPA_BASE_URL;
  process.env.PAYMENT_PROVIDER = 'chapa';
  process.env.CHAPA_SECRET_KEY = 'test-only-secret';
  process.env.CHAPA_BASE_URL = 'https://chapa.example.test';

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { status: 'successful', reference: 'PO-test-123' },
      }),
    });
    const confirmed = await verifyChapaTransfer('PO-test-123');
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.status, 'PAID');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { status: 'successful' },
      }),
    });
    const missingReference = await verifyChapaTransfer('PO-test-123');
    assert.equal(missingReference.status, 'PROCESSING');
    assert.equal(missingReference.ok, false);

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { status: 'successful', reference: 'PO-other-transfer' },
      }),
    });
    const mismatchedReference = await verifyChapaTransfer('PO-test-123');
    assert.equal(mismatchedReference.status, 'PROCESSING');
    assert.equal(mismatchedReference.ok, false);
    assert.equal(mismatchedReference.providerReference, 'PO-test-123');
  } finally {
    global.fetch = originalFetch;
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
    if (previousSecret === undefined) delete process.env.CHAPA_SECRET_KEY;
    else process.env.CHAPA_SECRET_KEY = previousSecret;
    if (previousBaseUrl === undefined) delete process.env.CHAPA_BASE_URL;
    else process.env.CHAPA_BASE_URL = previousBaseUrl;
  }
});
