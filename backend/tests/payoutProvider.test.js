const test = require('node:test');
const assert = require('node:assert/strict');
const { listChapaBanks } = require('../utils/payoutProvider');

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
