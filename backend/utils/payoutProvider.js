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

const hasTransferApprovalConfig = () =>
  Boolean((process.env.CHAPA_TRANSFER_APPROVAL_SECRET || '').trim());

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

  if (normalized === 'success') {
    return 'PAID';
  }

  if (normalized === 'failed') {
    return 'FAILED';
  }

  if (normalized === 'pending') {
    return 'PROCESSING';
  }

  return 'PENDING';

};

const normalizeChapaBank = (bank) => {
  const name = String(
    bank?.name ||
    bank?.bank_name ||
    bank?.bankName ||
    bank?.label ||
    ''
  ).trim();
  const code = String(bank?.bank_code ?? bank?.code ?? bank?.id ?? '').trim();

  const slug = String(

    bank?.bank_slug ??

      bank?.slug ??

      ''

  ).trim();

  const canProcessPayouts = bank?.can_process_payouts;
  const payoutSupported = canProcessPayouts === undefined ||
      ![false, 0, '0', 'false'].includes(
        typeof canProcessPayouts === 'string'
          ? canProcessPayouts.trim().toLowerCase()
          : canProcessPayouts
      );

  return name && code && payoutSupported
      ? { name, code, slug }
      : null;

};

const getTransferResponseData = (payload) => {
  let data = payload;
  while (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    data = data.data;
  }
  return data && typeof data === 'object' ? data : {};
};

const getTransferApiStatus = (payload) => {
  if (payload?.status) return String(payload.status).trim();

  let response = payload;
  while (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
    response = response.data;
    if (response.status && response.data && typeof response.data === 'object') {
      return String(response.status).trim();
    }
  }
  return '';
};

const getResponseReference = (payload) => {
  const data = getTransferResponseData(payload);
  return String(data.reference || data.tx_ref || payload?.reference || '').trim();
};

const summarizeTransferResponse = (response, payload) => {
  const data = getTransferResponseData(payload);
  return {
    httpStatus: response?.status ?? null,
    apiStatus: getTransferApiStatus(payload),
    message: String(payload?.message || payload?.error || '').trim(),
    reference: getResponseReference(payload),
    transferId: data.id === undefined || data.id === null ? '' : String(data.id),
    status: String(data.status || payload?.status || '').trim(),
    amount: data.amount === undefined || data.amount === null ? null : String(data.amount),
    currency: String(data.currency || '').trim(),
  };
};

const toTransferMinorUnits = (amount) => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount ?? '').trim());
  if (!match) return null;

  const units = Number(match[1]);
  const minorUnits = units * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(units) && Number.isSafeInteger(minorUnits)
    ? minorUnits
    : null;
};

const initiateChapaTransfer = async ({

  accountName,

  accountNumber,

  amount,

  bankCode,

  reference,

  currency = 'ETB',

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
  const normalizedAccountName = String(accountName || '').trim();
  const normalizedAccountNumber = String(accountNumber || '').trim();
  const normalizedBankCode = String(bankCode || '').trim();
  const normalizedReference = String(reference || '').trim();
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  const numericAmount = Number(amount);
  const invalidDetails = [];

  if (!normalizedAccountName) invalidDetails.push('account name');
  if (!normalizedAccountNumber) invalidDetails.push('account number');
  if (!normalizedBankCode) invalidDetails.push('bank code');
  if (!normalizedReference) invalidDetails.push('transfer reference');
  if (normalizedCurrency !== 'ETB') invalidDetails.push('ETB currency');
  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    Math.abs(numericAmount - Number(numericAmount.toFixed(2))) > 1e-8
  ) {
    invalidDetails.push('positive amount with no more than two decimal places');
  }

  if (invalidDetails.length) {
    return {
      ok: false,
      outcomeUnknown: false,
      status: 'FAILED',
      providerReference: '',
      message: `Chapa transfer was not submitted: invalid ${invalidDetails.join(', ')}.`,
      responseDetails: {
        httpStatus: null,
        apiStatus: 'not_submitted',
        message: `Invalid ${invalidDetails.join(', ')}.`,
        reference: '',
        transferId: '',
        status: '',
        amount: null,
        currency: '',
      },
    };
  }

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
        account_name: normalizedAccountName,
        account_number: normalizedAccountNumber,
        amount: numericAmount.toFixed(2),
        currency: normalizedCurrency,
        reference: normalizedReference,
        bank_code: /^\d+$/.test(normalizedBankCode)
          ? Number(normalizedBankCode)
          : normalizedBankCode,
        ...(sandboxMode ? { status: testStatus } : {}),
      }),

    }

  );

  const data = getTransferResponseData(payload);
  const providerStatus = getTransferApiStatus(payload).toLowerCase();
  const accepted = response.ok && providerStatus === 'success';
  const explicitlyRejected = providerStatus === 'failed' ||
    (!response.ok && response.status >= 400 && response.status < 500);

  const providerReference = getResponseReference(payload);

  return {

    ok: accepted,
    outcomeUnknown: !accepted && !explicitlyRejected,

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

  const data = getTransferResponseData(payload);

  const returnedReference = getResponseReference(payload);
  const requestedReference = String(reference).trim();
  const apiConfirmed = response.ok &&
    getTransferApiStatus(payload).toLowerCase() === 'success';
  const referenceConfirmed = Boolean(
    returnedReference &&
    returnedReference === requestedReference
  );
  const returnedAmount = toTransferMinorUnits(data.amount);
  const expectedAmount = toTransferMinorUnits(expectedTransfer.amount);
  const amountConfirmed = data.amount !== undefined &&
    returnedAmount !== null &&
    expectedAmount !== null &&
    returnedAmount === expectedAmount;
  const currencyConfirmed = Boolean(data.currency) &&
    Boolean(expectedTransfer.currency) &&
    String(data.currency || '').trim().toUpperCase() ===
      String(expectedTransfer.currency).trim().toUpperCase();
  const transactionStatus = normalizeTransferStatus(data.status);
  const confirmed = apiConfirmed && referenceConfirmed && amountConfirmed && currencyConfirmed;
  const verificationIssues = [];
  if (!returnedReference) verificationIssues.push('reference was omitted');
  else if (!referenceConfirmed) verificationIssues.push('reference does not match the payout');
  if (!amountConfirmed) {
    verificationIssues.push(
      data.amount === undefined || data.amount === null || String(data.amount).trim() === ''
        ? 'amount was omitted'
        : 'amount does not match the payout'
    );
  }
  if (!currencyConfirmed) {
    verificationIssues.push(
      data.currency && String(data.currency).trim()
        ? 'currency does not match the payout'
        : 'currency was omitted'
    );
  }
  const providerMessage = payload?.message || payload?.error || '';
  const isTestModeResponse = /test mode/i.test(providerMessage);

  return {
    ok: confirmed,
    status: confirmed ? transactionStatus : 'PROCESSING',
    providerReference: referenceConfirmed ? returnedReference : '',

    message: !apiConfirmed
      ? (providerMessage || `Chapa transfer verification failed with HTTP ${response.status}.`)
      : verificationIssues.length
        ? `${isTestModeResponse ? 'Chapa test-mode verification' : 'Chapa verification'} ${verificationIssues.join(', ')}; the payout remains unconfirmed.`
        : providerMessage,

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

    const failureMessage = response.ok
      ? 'Chapa returned no usable payout banks.'
      : (payload?.message || `Chapa bank list request failed with HTTP ${response.status}.`);
    console.error('Chapa bank list request failed:', failureMessage);

    return {

      ok: false,

      banks: [],

      message: response.ok
        ? `${failureMessage} Please try again later.`
        : failureMessage,

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
  hasTransferApprovalConfig,

  hasBankListConfig,

  initiateChapaTransfer,

  verifyChapaTransfer,

  listChapaBanks,

  createPayoutReference,

  normalizeTransferStatus,

  normalizeChapaBank,

  isSandboxTransferMode,

};