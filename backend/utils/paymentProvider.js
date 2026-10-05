const crypto = require('crypto');

const PROVIDER_REQUEST_TIMEOUT_MS = 15000;

const fetchProviderJson = async (url, options = {}) => {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    PROVIDER_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const payload = await response.json();

    return {
      response,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const getProviderConfig = () => {
  const provider = (process.env.PAYMENT_PROVIDER || '')
    .trim()
    .toLowerCase();

  const mode = (process.env.PAYMENT_MODE || 'sandbox')
    .trim()
    .toLowerCase();

  const sandboxEnabled =
    String(process.env.PAYMENT_SANDBOX || 'false')
      .trim()
      .toLowerCase() === 'true';

  return {
    provider,
    mode,
    sandboxEnabled,

    baseUrl: (
      process.env.CHAPA_BASE_URL ||
      'https://api.chapa.co'
    ).replace(/\/+$/, ''),

    secretKey: (process.env.CHAPA_SECRET_KEY || '').trim(),

    callbackUrl: (
      process.env.CHAPA_CALLBACK_URL || ''
    ).trim(),

    returnUrl: (
      process.env.CHAPA_RETURN_URL || ''
    ).trim(),

    webhookSecret: (
      process.env.CHAPA_WEBHOOK_SECRET || ''
    ).trim(),
  };
};

const hasChapaConfig = () => {
  const config = getProviderConfig();

  return (
    config.provider === 'chapa' &&
    !!config.secretKey &&
    !!config.callbackUrl &&
    !!config.baseUrl
  );
};

const initializeChapaPayment = async ({
  amount,
  currency = 'ETB',
  email,
  phone,
  paymentReference,
  callbackUrl,
  returnUrl,
  metadata = {},
}) => {
  if (!hasChapaConfig()) {
    return null;
  }

  const config = getProviderConfig();

  const customizationDescription = `Rent payment - ${
    String(metadata.propertyTitle || 'rented property')
  }`.slice(0, 50);

  const configuredReturnUrl = config.returnUrl.replace(
    '{propertyId}',
    encodeURIComponent(String(metadata.propertyId || ''))
  );

  const frontendBaseUrl = String(
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '');

  const developmentReturnUrl =
    `${frontendBaseUrl}/tenant/rent-payment/${encodeURIComponent(
      String(metadata.propertyId || '')
    )}`;

  const resolvedReturnUrl =
    returnUrl ||
    (
      process.env.NODE_ENV === 'production'
        ? configuredReturnUrl
        : developmentReturnUrl
    );

  const { response, payload } = await fetchProviderJson(
    `${config.baseUrl}/v1/transaction/initialize`,
    {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        amount: Number(amount).toFixed(2),
        currency,

        email: email || '',
        phone: phone || '',

        tx_ref: paymentReference,

        callback_url:
          callbackUrl || config.callbackUrl,

        return_url: resolvedReturnUrl,

        customization: {
          title: 'RentalVerify',
          description: customizationDescription,
        },

        metadata,
      }),
    }
  );
  console.log(
  'CHAPA VERIFY RESPONSE:',
  JSON.stringify(payload, null, 2)
);

  if (
    !response.ok ||
    !['success', 'successful'].includes(String(payload?.status || '').toLowerCase()) ||
    !payload?.data?.checkout_url ||
    payload?.data?.tx_ref !== paymentReference
  ) {
    return {
      ok: false,
      provider: 'chapa',
      providerStatus: 'failed',
      providerMessage:
        payload?.message ||
        'Payment provider did not confirm the requested transaction reference',
      payload,
    };
  }

  return {
    ok: true,
    provider: 'chapa',
    providerStatus: 'initialized',

    providerReference: payload.data.tx_ref,

    providerCheckoutUrl:
      payload.data.checkout_url,

    providerPaymentId: payload.data.id || undefined,

    providerTransactionReference:
      typeof payload.data.reference === 'string' && payload.data.reference.trim()
        ? payload.data.reference.trim()
        : undefined,

    payload,
  };
};

const verifyChapaPayment = async (providerReference) => {
  if (!hasChapaConfig() || !providerReference) {
    return null;
  }

  const config = getProviderConfig();

  const { response, payload } = await fetchProviderJson(
    `${config.baseUrl}/v1/transaction/verify/${encodeURIComponent(
      providerReference
    )}`,
    {
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
      },
    }
  );

  if (
    !response.ok ||
    !['success', 'successful'].includes(String(payload?.status || '').toLowerCase())
  ) {
    return {
      ok: false,
      apiStatus: String(payload?.status || '').trim().toLowerCase(),
      providerStatus: 'failed',
      providerMessage:
        payload?.message ||
        'Payment verification failed',
      payload,
    };
  }

  return {
    ok: true,
    apiStatus: String(payload?.status || '').trim().toLowerCase(),

    providerStatus: normalizeProviderStatus(payload?.data?.status),

    amount: payload?.data?.amount,

    currency: payload?.data?.currency,

    providerReference:
      typeof payload?.data?.tx_ref === 'string'
        ? payload.data.tx_ref.trim()
        : '',

    providerTransactionReference:
      typeof payload?.data?.reference === 'string'
        ? payload.data.reference.trim()
        : '',

    providerPaymentId:
      typeof payload?.data?.id === 'string' ||
      typeof payload?.data?.id === 'number'
        ? String(payload.data.id)
        : '',

    payload,
  };
};

const validateChapaPaymentVerification = (verification, expectedPayment) => {
  if (
    !verification?.ok ||
    !['success', 'successful'].includes(verification.apiStatus)
  ) {
    return { ok: false, reason: 'Chapa did not confirm the verification response' };
  }

  if (!['paid', 'failed', 'cancelled'].includes(verification.providerStatus)) {
    return { ok: false, reason: 'Chapa transaction is not in a final status' };
  }

  const receivedAmount = Number(verification.amount);
  const expectedAmount = Number(expectedPayment?.amount);
  if (
    !Number.isFinite(receivedAmount) ||
    !Number.isFinite(expectedAmount) ||
    receivedAmount.toFixed(2) !== expectedAmount.toFixed(2)
  ) {
    return { ok: false, reason: 'Chapa transaction amount does not match the expected rent' };
  }

  if (
    String(verification.currency || '').trim().toUpperCase() !==
    String(expectedPayment?.currency || '').trim().toUpperCase()
  ) {
    return { ok: false, reason: 'Chapa transaction currency does not match the expected currency' };
  }

  if (
    !String(expectedPayment?.paymentReference || '').trim() ||
    verification.providerReference !== expectedPayment.paymentReference
  ) {
    return { ok: false, reason: 'Chapa transaction reference does not match the payment reference' };
  }

  if (!String(verification.providerTransactionReference || '').trim()) {
    return { ok: false, reason: 'Chapa did not return its transaction reference' };
  }
  if (
    expectedPayment?.providerTransactionReference &&
    verification.providerTransactionReference !== expectedPayment.providerTransactionReference
  ) {
    return { ok: false, reason: 'Chapa transaction reference does not match the initialized transaction' };
  }

  return { ok: true, status: verification.providerStatus };
};

const verifyChapaWebhook = ({
  body,
  rawBody,
  headers,
}) => {
  const config = getProviderConfig();

  const incomingSignature = (
    headers?.['x-chapa-signature'] || ''
  ).toString();

  if (!config.webhookSecret) {
    return {
      ok: false,
      reason: 'Missing CHAPA_WEBHOOK_SECRET',
    };
  }

  if (!incomingSignature) {
    return {
      ok: false,
      reason: 'Missing webhook signature',
    };
  }

  const payload =
    rawBody && rawBody.length > 0
      ? rawBody
      : Buffer.from(
          JSON.stringify(body || {})
        );

  const expectedSignature =
    crypto
      .createHmac(
        'sha256',
        config.webhookSecret
      )
      .update(payload)
      .digest('hex');

  if (expectedSignature !== incomingSignature) {
    return {
      ok: false,
      reason: 'Invalid webhook signature',
    };
  }

  return {
    ok: true,
    body,
  };
};

const normalizeProviderStatus = (status) => {
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
    return 'paid';
  }

  if (
    [
      'failed',
      'declined',
      'rejected',
    ].includes(normalized)
  ) {
    return 'failed';
  }

  if (
    [
      'cancelled',
      'canceled',
    ].includes(normalized)
  ) {
    return 'cancelled';
  }

  if (
    [
      'pending',
      'in_progress',
      'processing',
    ].includes(normalized)
  ) {
    return 'pending';
  }

  return normalized || 'pending';
};

module.exports = {
  getProviderConfig,
  hasChapaConfig,
  initializeChapaPayment,
  verifyChapaPayment,
  validateChapaPaymentVerification,
  verifyChapaWebhook,
  normalizeProviderStatus,
};