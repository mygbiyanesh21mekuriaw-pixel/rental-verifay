const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeChapaPayment,
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

const withChapaInitialization = async (fetchHandler, run) => {
  const originalFetch = global.fetch;
  const envKeys = [
    'PAYMENT_PROVIDER',
    'CHAPA_SECRET_KEY',
    'CHAPA_CALLBACK_URL',
    'CHAPA_BASE_URL',
    'CHAPA_RETURN_URL',
    'FRONTEND_URL',
    'NODE_ENV',
  ];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.PAYMENT_PROVIDER = 'chapa';
  process.env.CHAPA_SECRET_KEY = 'test-only-secret';
  process.env.CHAPA_CALLBACK_URL = 'https://backend.example.test/api/payments/callback/chapa';
  process.env.CHAPA_BASE_URL = 'https://chapa.example.test';
  delete process.env.CHAPA_RETURN_URL;
  delete process.env.NODE_ENV;
  global.fetch = fetchHandler;

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

test('accepts a successful hosted-link response when Chapa omits tx_ref', async () => {
  const paymentReference = 'RP-test-123';
  await withChapaInitialization(async (url, options) => {
    assert.equal(url, 'https://chapa.example.test/v1/transaction/initialize');
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.tx_ref, paymentReference);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        message: 'Hosted Link',
        status: 'success',
        data: { checkout_url: 'https://checkout.example.test/session' },
      }),
    };
  }, async () => {
    const result = await initializeChapaPayment({
      amount: 2000,
      currency: 'ETB',
      email: 'tenant@example.test',
      paymentReference,
      metadata: { propertyId: 'property-id' },
    });

    assert.equal(result.ok, true);
    assert.equal(result.providerReference, paymentReference);
    assert.equal(result.providerCheckoutUrl, 'https://checkout.example.test/session');
  });
});

test('rejects a successful hosted-link response with a different tx_ref', async () => {
  await withChapaInitialization(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      message: 'Hosted Link',
      status: 'success',
      data: {
        tx_ref: 'RP-someone-elses-payment',
        checkout_url: 'https://checkout.example.test/session',
      },
    }),
  }), async () => {
    const result = await initializeChapaPayment({
      amount: 2000,
      currency: 'ETB',
      email: 'tenant@example.test',
      paymentReference: 'RP-test-123',
    });

    assert.equal(result.ok, false);
  });
});

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
  const previousMode = process.env.PAYMENT_MODE;
  const previousSandbox = process.env.PAYMENT_SANDBOX;
  const previousSecret = process.env.CHAPA_SECRET_KEY;
  const previousBaseUrl = process.env.CHAPA_BASE_URL;
  process.env.PAYMENT_PROVIDER = 'chapa';
  process.env.PAYMENT_MODE = 'live';
  process.env.PAYMENT_SANDBOX = 'false';
  process.env.CHAPA_SECRET_KEY = 'test-only-secret';
  process.env.CHAPA_BASE_URL = 'https://chapa.example.test';

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { status: 'success', reference: 'PO-test-123', amount: '3000.00', currency: 'ETB' },
      }),
    });
    const confirmed = await verifyChapaTransfer('PO-test-123', { amount: 3000, currency: 'ETB' });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.status, 'PAID');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { status: 'success', amount: '3000.00', currency: 'ETB' },
      }),
    });
    const missingReference = await verifyChapaTransfer('PO-test-123', { amount: 3000, currency: 'ETB' });
    assert.equal(missingReference.status, 'PROCESSING');
    assert.equal(missingReference.ok, false);

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { status: 'success', reference: 'PO-other-transfer', amount: '3000.00', currency: 'ETB' },
      }),
    });
    const mismatchedReference = await verifyChapaTransfer('PO-test-123', { amount: 3000, currency: 'ETB' });
    assert.equal(mismatchedReference.status, 'PROCESSING');
    assert.equal(mismatchedReference.ok, false);
    assert.equal(mismatchedReference.providerReference, '');
    assert.match(mismatchedReference.message, /reference does not match/i);

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { status: 'success', reference: 'PO-test-123', amount: '2999.00', currency: 'ETB' },
      }),
    });
    const wrongAmount = await verifyChapaTransfer('PO-test-123', { amount: 3000, currency: 'ETB' });
    assert.equal(wrongAmount.ok, false);
    assert.equal(wrongAmount.status, 'PROCESSING');
  } finally {
    global.fetch = originalFetch;
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
    if (previousMode === undefined) delete process.env.PAYMENT_MODE;
    else process.env.PAYMENT_MODE = previousMode;
    if (previousSandbox === undefined) delete process.env.PAYMENT_SANDBOX;
    else process.env.PAYMENT_SANDBOX = previousSandbox;
    if (previousSecret === undefined) delete process.env.CHAPA_SECRET_KEY;
    else process.env.CHAPA_SECRET_KEY = previousSecret;
    if (previousBaseUrl === undefined) delete process.env.CHAPA_BASE_URL;
    else process.env.CHAPA_BASE_URL = previousBaseUrl;
  }
});
