const crypto = require('crypto');

const TRANSFER_TIMEOUT_MS = 15000;

const transferConfig = () => ({

  provider: (process.env.PAYMENT_PROVIDER || '')

    .trim()

    .toLowerCase(),

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

const initiateChapaTransfer = async ({

  accountName,

  accountNumber,

  amount,

  bankCode,

  reference,

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

      (

        payload?.status === undefined ||

        payload.status === 'success' ||

        payload.status === 'successful'

      ),

    status: normalizeTransferStatus(
      data.status

    ),

    providerReference,

    message:

      payload?.message ||

      payload?.error ||

      'Transfer request failed',

    payload,

  };

};

const verifyChapaTransfer = async (

  reference

) => {

  if (

    !hasTransferConfig() ||

    !reference

  ) {

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
  const transactionStatus = normalizeTransferStatus(data.status);
  const confirmed = apiConfirmed && referenceConfirmed;

  return {
    ok: confirmed,
    status: confirmed ? transactionStatus : 'PROCESSING',
    providerReference: referenceConfirmed
      ? returnedReference
      : requestedReference,

    message:

      payload?.message ||

      payload?.error ||

      '',

    payload,

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
console.log('CHAPA BANK RESPONSE:', JSON.stringify(payload, null, 2));
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

};