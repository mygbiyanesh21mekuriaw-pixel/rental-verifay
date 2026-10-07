const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasTransferConfig,
  initiateChapaTransfer,
  isSandboxTransferMode,
  listChapaBanks,
} = require('../utils/payoutProvider');

const withEnvironment = async (values, callback) => {
  const previousValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]])
  );

  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });

  try {
    await callback();
  } finally {
    Object.entries(previousValues).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

test('loads and normalizes the supported bank list from Chapa', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://chapa.example.test/v1/banks');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
    return {
      ok: true,
      json: async () => ({
        status: 'success',
        data: [
          { bank_code: '001', bank_name: 'Example Bank', bank_slug: 'example-bank' },
          { code: '002', name: 'Another Bank' },
          { bank_name: 'Incomplete bank entry' },
        ],
      }),
    };
  };

  try {
    await withEnvironment({
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      const result = await listChapaBanks();
      assert.equal(result.ok, true);
      assert.deepEqual(result.banks, [
        { name: 'Example Bank', code: '001', slug: 'example-bank' },
        { name: 'Another Bank', code: '002', slug: '' },
      ]);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('does not return a bank list when the backend Chapa secret is missing', async () => {
  await withEnvironment({ CHAPA_SECRET_KEY: undefined }, async () => {
    const result = await listChapaBanks();
    assert.equal(result.ok, false);
    assert.deepEqual(result.banks, []);
    assert.match(result.message, /CHAPA_SECRET_KEY/);
  });
});

test('Chapa transfers support test and live modes when the backend secret is configured', async () => {
  await withEnvironment({
    PAYMENT_PROVIDER: 'chapa',
    PAYMENT_MODE: 'sandbox',
    PAYMENT_SANDBOX: 'true',
    CHAPA_SECRET_KEY: 'test-only-secret',
  }, async () => {
    assert.equal(hasTransferConfig(), true);
    assert.equal(isSandboxTransferMode(), true);
  });

  await withEnvironment({
    PAYMENT_PROVIDER: 'chapa',
    PAYMENT_MODE: 'live',
    PAYMENT_SANDBOX: 'false',
    CHAPA_SECRET_KEY: 'test-only-secret',
  }, async () => {
    assert.equal(hasTransferConfig(), true);
    assert.equal(isSandboxTransferMode(), false);
  });
});

test('sandbox payout submits the documented Chapa transfer fields and test status', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
    PAYMENT_PROVIDER: 'chapa',
    PAYMENT_MODE: 'sandbox',
    PAYMENT_SANDBOX: 'true',
    CHAPA_SECRET_KEY: 'test-only-secret',
    CHAPA_BASE_URL: 'https://chapa.example.test',
  }, async () => {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://chapa.example.test/v1/transfers');
      assert.equal(options.method, 'POST');
      assert.ok(options.headers.Authorization.startsWith('Bearer '));
      const body = JSON.parse(options.body);
      assert.deepEqual(body, {
        account_name: 'Landlord Example',
        account_number: '100123456789',
        amount: '3000.00',
        currency: 'ETB',
        reference: 'PO-test-123',
        bank_code: 'CBE',
        status: 'success',
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Transfer simulated',
          data: {
            reference: 'PO-test-123',
            status: 'success',
            amount: '3000.00',
            currency: 'ETB',
          },
        }),
      };
    };

    const result = await initiateChapaTransfer({
      accountName: 'Landlord Example',
      accountNumber: '100123456789',
      amount: 3000,
      bankCode: 'CBE',
      reference: 'PO-test-123',
      testStatus: 'success',
    });

    assert.equal(isSandboxTransferMode(), true);
    assert.equal(result.ok, true);
    assert.equal(result.providerReference, 'PO-test-123');
    assert.deepEqual(result.responseDetails, {
      httpStatus: 200,
      apiStatus: 'success',
      message: 'Transfer simulated',
      reference: 'PO-test-123',
      transferId: '',
      status: 'success',
      amount: '3000.00',
      currency: 'ETB',
    });
    assert.equal(Object.hasOwn(result, 'payload'), false);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('live payout requests omit the sandbox-only simulation status', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
    PAYMENT_PROVIDER: 'chapa',
    PAYMENT_MODE: 'live',
    PAYMENT_SANDBOX: 'false',
    CHAPA_SECRET_KEY: 'test-only-secret',
    CHAPA_BASE_URL: 'https://chapa.example.test',
  }, async () => {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(Object.hasOwn(body, 'status'), false);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: { reference: 'PO-live-123', status: 'processing' },
        }),
      };
    };

    const result = await initiateChapaTransfer({
      accountName: 'Landlord Example',
      accountNumber: '100123456789',
      amount: 3000,
      bankCode: 'CBE',
      reference: 'PO-live-123',
      testStatus: 'success',
    });
    assert.equal(isSandboxTransferMode(), false);
    assert.equal(result.ok, true);
    });
  } finally {
    global.fetch = originalFetch;
  }
});
