const crypto = require('crypto');

const TRANSFER_TIMEOUT_MS = 15000;

const transferConfig = () => ({

  provider: (process.env.PAYMENT_PROVIDER || '')

    .trim()

    .toLowerCase(),

  mode: (process.env.PAYMENT_MODE || 'sandbox')

    .trim()

    .toLowerCase(),

  sandboxEnabled: String(process.env.PAYMENT_SANDBOX || 'false')

    .trim()

    .toLowerCase() === 'true',

  // CHAPA_BASE_URL is optional.

  // If it is not in .env, use Chapa's default API URL.

  baseUrl: (
  process.env.CHAPA_BASE_URL ||
  'https://api.chapa.co'
).replace(/\/+$/, ''),

  secretKey: (

    process.env.CHAPA_SECRET_KEY || ''

  ).trim(),

});

const isSandboxTransferMode = () => {
  const config = transferConfig();
  return config.sandboxEnabled || ['sandbox', 'test'].includes(config.mode);
};

const hasTransferConfig = () => {

  const config = transferConfig();

  return (

    config.provider === 'chapa' &&

    Boolean(config.secretKey)

  );

};

const hasBankListConfig = () => {

  const config = transferConfig();

  return Boolean(config.secretKey);

};

const fetchTransferJson = async (

  url,

  options = {}

) => {

  const controller = new AbortController();

  const timeout = setTimeout(

    () => controller.abort(),

    TRANSFER_TIMEOUT_MS

  );

  try {

    const response = await fetch(url, {

      ...options,

      signal: controller.signal,

    });

    const payload = await response

      .json()

      .catch(() => ({}));

    return {

      response,

      payload,

    };

  } finally {

    clearTimeout(timeout);

  }

};

const normalizeTransferStatus = (status) => {

  const normalized = String(status || '')

    .trim()

    .toLowerCase();

  if (

    [

      'success',

      'successful',

      'paid',

      'completed',

    ].includes(normalized)

  ) {

    return 'PAID';

  }

  if (

    [

      'failed',

      'declined',

      'rejected',

    ].includes(normalized)

  ) {

    return 'FAILED';

  }

  if (

    [

      'reverted',

      'reversed',

    ].includes(normalized)

  ) {

    return 'REVERTED';

  }

  if (

    [

      'pending',

      'processing',

      'queued',

      'initiated',

    ].includes(normalized)

  ) {

    return 'PROCESSING';

  }

  return 'PENDING';

};

const normalizeChapaBank = (bank) => {

  const name =

    bank?.name ||

    bank?.bank_name ||

    bank?.bankName;

  const code = String(

    bank?.bank_code ??

      bank?.code ??

      bank?.id ??

      bank?.bank_slug ??

      bank?.slug ??

      ''

  ).trim();

  const slug = String(

    bank?.bank_slug ??

      bank?.slug ??

      ''

  ).trim();

  return name && code

    ? {

        name,

        code,

        slug,

      }

    : null;

};

const summarizeTransferResponse = (response, payload) => {
  const data = payload?.data || {};
  return {
    httpStatus: response?.status ?? null,
    apiStatus: String(payload?.status || '').trim(),
    message: String(payload?.message || payload?.error || '').trim(),
    reference: String(data.reference || data.tx_ref || payload?.reference || '').trim(),
    transferId: data.id === undefined || data.id === null ? '' : String(data.id),
    status: String(data.status || payload?.status || '').trim(),
    amount: data.amount === undefined ? null : String(data.amount),
    currency: String(data.currency || '').trim(),
  };
};

const initiateChapaTransfer = async ({

  accountName,

  accountNumber,

  amount,

  bankCode,

  reference,

  testStatus,

}) => {

  if (!hasTransferConfig()) {

    return {

      ok: false,

      status: 'FAILED',

      message:

        'Chapa transfer configuration is missing',

    };

  }

  const config = transferConfig();
  const sandboxMode = isSandboxTransferMode();

  if (sandboxMode && !['success', 'failed', 'pending'].includes(testStatus)) {
    throw new Error('Chapa sandbox transfer status must be success, failed, or pending.');
  }

  const {

    response,

    payload,

  } = await fetchTransferJson(

    `${config.baseUrl}/v1/transfers`,

    {

      method: 'POST',

      headers: {

        Authorization:

          `Bearer ${config.secretKey}`,

        'Content-Type':

          'application/json',

        Accept:

          'application/json',

      },

      body: JSON.stringify({
        account_name: accountName,
        account_number: accountNumber,
        amount: Number(amount).toFixed(2),
        currency: 'ETB',
        reference,
        bank_code: bankCode,
        ...(sandboxMode ? { status: testStatus } : {}),
      }),

    }

  );

  const data =

    payload?.data || {};

  const providerReference =

    data.reference ||

    data.tx_ref ||

    payload?.reference ||

    reference;

  return {

    ok:
      response.ok &&
      ['success', 'successful'].includes(
        String(payload?.status || '').toLowerCase()
      ),

    status: normalizeTransferStatus(
      data.status

    ),

    providerReference,

    message:

      payload?.message ||

      payload?.error ||

      `Chapa transfer request failed with HTTP ${response.status}`,

    responseDetails: summarizeTransferResponse(response, payload),

  };

};

const verifyChapaTransfer = async (reference, expectedTransfer = {}) => {

  if (!hasTransferConfig() || !reference) {

    return {

      ok: false,

      status: 'PENDING',

      message:

        'Chapa transfer configuration is missing',

    };

  }

  const config = transferConfig();

  const {

    response,

    payload,

  } = await fetchTransferJson(

    `${config.baseUrl}/v1/transfers/verify/${encodeURIComponent(

      reference

    )}`,

    {

      headers: {

        Authorization:

          `Bearer ${config.secretKey}`,

        Accept:

          'application/json',

      },

    }

  );

  const data =
    payload?.data || {};

  const returnedReference = String(
    data.reference ||
    data.tx_ref ||
    ''
  ).trim();
  const requestedReference = String(reference).trim();
  const apiConfirmed = response.ok &&
    ['success', 'successful'].includes(String(payload?.status || '').toLowerCase());
  const referenceConfirmed = Boolean(
    returnedReference &&
    returnedReference === requestedReference
  );
  const returnedAmount = Number(data.amount);
  const expectedAmount = Number(expectedTransfer.amount);
  const amountConfirmed = expectedTransfer.amount === undefined ||
    data.amount === undefined ||
    (Number.isFinite(returnedAmount) &&
      Number.isFinite(expectedAmount) &&
      returnedAmount.toFixed(2) === expectedAmount.toFixed(2));
  const currencyConfirmed = expectedTransfer.currency === undefined ||
    data.currency === undefined ||
    String(data.currency || '').trim().toUpperCase() ===
      String(expectedTransfer.currency).trim().toUpperCase();
  const transactionStatus = normalizeTransferStatus(data.status);
  const confirmed = apiConfirmed && referenceConfirmed && amountConfirmed && currencyConfirmed;

  return {
    ok: confirmed,
    status: confirmed ? transactionStatus : 'PROCESSING',
    providerReference: referenceConfirmed
      ? returnedReference
      : requestedReference,

    message: !amountConfirmed || !currencyConfirmed
      ? 'Chapa transfer amount or currency does not match the payout.'
      : (payload?.message || payload?.error || ''),

    responseDetails: summarizeTransferResponse(response, payload),

  };

};

const listChapaBanks = async () => {

  // Bank list only needs the Chapa Secret Key.

  // CHAPA_BASE_URL is optional because we have a default.

  if (!hasBankListConfig()) {

    return {

      ok: false,

      banks: [],

      message:

        'Chapa bank list is unavailable because CHAPA_SECRET_KEY is not configured. For local development, set it in backend/.env and restart the backend. For deployment, add CHAPA_SECRET_KEY to the backend service environment variables and restart or redeploy that service. Never add the Chapa secret key to the frontend.',

    };

  }

  const config = transferConfig();

  try {

    const {

      response,

      payload,

    } = await fetchTransferJson(

      `${config.baseUrl}/v1/banks`,

      {

        method: 'GET',

        headers: {

          Authorization:

            `Bearer ${config.secretKey}`,

          Accept:

            'application/json',

        },

      }

    );
    const records =

      Array.isArray(payload?.data)

        ? payload.data

        : Array.isArray(

            payload?.data?.banks

          )

        ? payload.data.banks

        : Array.isArray(

            payload?.banks

          )

        ? payload.banks

        : [];

    const banks = records

      .map(normalizeChapaBank)

      .filter(Boolean);

    if (

      response.ok &&

      banks.length

    ) {

      return {

        ok: true,

        banks,

        message:

          payload?.message || '',

      };

    }

    console.error(

      'Chapa bank list request failed:',

      payload?.message ||

        response.status

    );

    return {

      ok: false,

      banks: [],

      message:

        payload?.message ||

        'Unable to load Chapa-supported banks. Please try again.',

    };

  } catch (error) {

    console.error(

      'Chapa bank list request error:',

      error.message

    );

    return {

      ok: false,

      banks: [],

      message:

        'Unable to reach Chapa to load supported banks. Please try again.',

    };

  }

};

const createPayoutReference = () =>

  `PO-${Date.now()}-${crypto

    .randomBytes(4)

    .toString('hex')

    .toUpperCase()}`;

module.exports = {

  hasTransferConfig,

  hasBankListConfig,

  initiateChapaTransfer,

  verifyChapaTransfer,

  listChapaBanks,

  createPayoutReference,

  normalizeTransferStatus,

  normalizeChapaBank,

  isSandboxTransferMode,

};