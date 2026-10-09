const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasTransferConfig,
  initiateChapaTransfer,
  isSandboxTransferMode,
  listChapaBanks,
  verifyChapaTransfer,
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
          { id: 946, name: 'Commercial Bank of Ethiopia (CBE)', can_process_payouts: 1 },
          { id: 687, name: 'Payout-disabled bank', can_process_payouts: 0 },
          { id: 947, label: 'Bank name from label', can_process_payouts: '1' },
          { bank_slug: 'bank-slug-only', bank_name: 'Bank without transfer code' },
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
        { name: 'Commercial Bank of Ethiopia (CBE)', code: '946', slug: '' },
        { name: 'Bank name from label', code: '947', slug: '' },
      ]);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('does not treat an informational message as a usable bank list', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      message: 'Banks retrieved',
      data: [{ id: 1 }],
    }),
  });

  try {
    await withEnvironment({
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      const result = await listChapaBanks();
      assert.equal(result.ok, false);
      assert.deepEqual(result.banks, []);
      assert.match(result.message, /no usable payout banks/i);
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

test('sandbox payout submits Chapa snake-case fields and test status', async () => {
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
        account_number: 'CHAPA_TEST_ACCOUNT_FIXTURE',
        amount: '3000.00',
        currency: 'ETB',
        reference: 'PO-test-123',
        bank_code: 946,
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
      accountNumber: 'CHAPA_TEST_ACCOUNT_FIXTURE',
      amount: 3000,
      bankCode: '946',
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

test('live payout sends Chapa fields and omits the sandbox-only simulation status', async () => {
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
      assert.deepEqual(body, {
        account_name: 'Landlord Example',
        account_number: 'LIVE_ACCOUNT_FIXTURE',
        amount: '3000.00',
        currency: 'ETB',
        reference: 'PO-live-123',
        bank_code: 946,
      });
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
      accountNumber: 'LIVE_ACCOUNT_FIXTURE',
      amount: 3000,
      bankCode: '946',
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

test('invalid transfer details are rejected before any request is sent to Chapa', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
      PAYMENT_PROVIDER: 'chapa',
      PAYMENT_MODE: 'live',
      PAYMENT_SANDBOX: 'false',
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      let requests = 0;
      global.fetch = async () => {
        requests += 1;
        throw new Error('A transfer with invalid details must not be sent.');
      };

      const result = await initiateChapaTransfer({
        accountName: 'Landlord Example',
        accountNumber: '100123456789',
        amount: 0,
        bankCode: '',
        reference: '',
        currency: 'USD',
      });

      assert.equal(result.ok, false);
      assert.equal(result.outcomeUnknown, false);
      assert.equal(result.responseDetails.apiStatus, 'not_submitted');
      assert.match(result.message, /invalid bank code, transfer reference, ETB currency, positive amount/i);
      assert.equal(requests, 0);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('transfer submission does not invent a Chapa reference when the response omits it', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
      PAYMENT_PROVIDER: 'chapa',
      PAYMENT_MODE: 'live',
      PAYMENT_SANDBOX: 'false',
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: { status: 'processing' } }),
      });

      const result = await initiateChapaTransfer({
        accountName: 'Landlord Example',
        accountNumber: '100123456789',
        amount: 3000,
        bankCode: 'CBE',
        reference: 'PO-local-123',
      });

      assert.equal(result.ok, true);
      assert.equal(result.providerReference, '');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Chapa transfer verification requires the matching reference, amount, currency, and success status', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
      PAYMENT_PROVIDER: 'chapa',
      PAYMENT_MODE: 'live',
      PAYMENT_SANDBOX: 'false',
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      global.fetch = async (url, options) => {
        assert.equal(url, 'https://chapa.example.test/v1/transfers/verify/PO-verify-123');
        assert.ok(options.headers.Authorization.startsWith('Bearer '));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              reference: 'PO-verify-123',
              status: 'success',
              amount: '3000.00',
              currency: 'ETB',
            },
          }),
        };
      };

      const result = await verifyChapaTransfer('PO-verify-123', {
        amount: 3000,
        currency: 'ETB',
      });
      assert.equal(result.ok, true);
      assert.equal(result.status, 'PAID');
      assert.equal(result.providerReference, 'PO-verify-123');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Chapa test-mode verification without transfer details stays unconfirmed', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
      PAYMENT_PROVIDER: 'chapa',
      PAYMENT_MODE: 'sandbox',
      PAYMENT_SANDBOX: 'true',
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Transfer details (Test Mode)',
          data: { status: 'success' },
        }),
      });

      const result = await verifyChapaTransfer('PO-test-mode-123', {
        amount: 4000,
        currency: 'ETB',
      });

      assert.equal(result.ok, false);
      assert.equal(result.status, 'PROCESSING');
      assert.equal(result.providerReference, '');
      assert.match(result.message, /test-mode verification reference was omitted, amount was omitted, currency was omitted/i);
      assert.deepEqual(result.responseDetails, {
        httpStatus: 200,
        apiStatus: 'success',
        message: 'Transfer details (Test Mode)',
        reference: '',
        transferId: '',
        status: 'success',
        amount: null,
        currency: '',
      });
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('verification does not expose a provider reference when Chapa returns another reference', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
      PAYMENT_PROVIDER: 'chapa',
      PAYMENT_MODE: 'live',
      PAYMENT_SANDBOX: 'false',
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            reference: 'PO-another-transfer',
            status: 'success',
            amount: '3000.00',
            currency: 'ETB',
          },
        }),
      });

      const result = await verifyChapaTransfer('PO-verify-123', {
        amount: 3000,
        currency: 'ETB',
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 'PROCESSING');
      assert.equal(result.providerReference, '');
      assert.match(result.message, /reference does not match/i);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('incomplete and mismatched verification details remain unconfirmed', async () => {
  const originalFetch = global.fetch;
  const basePayload = {
    status: 'success',
    data: {
      reference: 'PO-incomplete-123',
      status: 'success',
      amount: '4000.00',
      currency: 'ETB',
    },
  };
  try {
    await withEnvironment({
      PAYMENT_PROVIDER: 'chapa',
      PAYMENT_MODE: 'live',
      PAYMENT_SANDBOX: 'false',
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      const cases = [
        ['reference', (payload) => { delete payload.data.reference; }, /reference was omitted/i],
        ['amount', (payload) => { delete payload.data.amount; }, /amount was omitted/i],
        ['currency', (payload) => { delete payload.data.currency; }, /currency was omitted/i],
        ['amount mismatch', (payload) => { payload.data.amount = '3999.99'; }, /amount does not match/i],
        ['amount precision mismatch', (payload) => { payload.data.amount = '4000.001'; }, /amount does not match/i],
        ['currency mismatch', (payload) => { payload.data.currency = 'USD'; }, /currency does not match/i],
      ];

      for (const [label, alterPayload, message] of cases) {
        const payload = structuredClone(basePayload);
        alterPayload(payload);
        global.fetch = async () => ({
          ok: true,
          status: 200,
          json: async () => payload,
        });
        const result = await verifyChapaTransfer('PO-incomplete-123', {
          amount: 4000,
          currency: 'ETB',
        });

        assert.equal(result.ok, false, label);
        assert.equal(result.status, 'PROCESSING', label);
        assert.match(result.message, message, label);
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('pending and failed transfer statuses are never reported as successful payouts', async () => {
  const originalFetch = global.fetch;
  try {
    await withEnvironment({
      PAYMENT_PROVIDER: 'chapa',
      PAYMENT_MODE: 'live',
      PAYMENT_SANDBOX: 'false',
      CHAPA_SECRET_KEY: 'test-only-secret',
      CHAPA_BASE_URL: 'https://chapa.example.test',
    }, async () => {
      for (const [providerStatus, expectedStatus] of [
        ['pending', 'PROCESSING'],
        ['processing', 'PENDING'],
        ['completed', 'PENDING'],
        ['failed', 'FAILED'],
      ]) {
        global.fetch = async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              reference: 'PO-status-123',
              status: providerStatus,
              amount: '4000.00',
              currency: 'ETB',
            },
          }),
        });
        const result = await verifyChapaTransfer('PO-status-123', {
          amount: 4000,
          currency: 'ETB',
        });

        assert.equal(result.ok, true);
        assert.equal(result.status, expectedStatus);
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('parses a nested Chapa transfer verification response without changing its values', async () => {
      const originalFetch = global.fetch;
      try {
        await withEnvironment({
          PAYMENT_PROVIDER: 'chapa',
          PAYMENT_MODE: 'live',
          PAYMENT_SANDBOX: 'false',
          CHAPA_SECRET_KEY: 'test-only-secret',
          CHAPA_BASE_URL: 'https://chapa.example.test',
        }, async () => {
          global.fetch = async (url, options) => {
            assert.equal(
              url,
              'https://chapa.example.test/v1/transfers/verify/APQfhhNqwnvoZ'
            );
            assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
            return {
              ok: true,
              status: 200,
              json: async () => ({
                status: 'success',
                message: 'Transfer verified',
                data: {
                  data: {
                    reference: 'APQfhhNqwnvoZ',
                    status: 'success',
                    amount: '4000.00',
                    currency: 'ETB',
                  },
                },
              }),
            };
          };

          const result = await verifyChapaTransfer('APQfhhNqwnvoZ', {
            amount: 4000,
            currency: 'ETB',
          });
          assert.equal(result.ok, true);
          assert.equal(result.status, 'PAID');
          assert.equal(result.responseDetails.reference, 'APQfhhNqwnvoZ');
          assert.equal(result.responseDetails.amount, '4000.00');
          assert.equal(result.responseDetails.currency, 'ETB');
        });
      } finally {
        global.fetch = originalFetch;
      }
    });
