const crypto = require('crypto');

const PROVIDER_REQUEST_TIMEOUT_MS = 15000;

const fetchProviderJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json();
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
};

const getProviderConfig = () => {
  const provider = (process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  const mode = (process.env.PAYMENT_MODE || 'sandbox').trim().toLowerCase();
  const sandboxEnabled = String(process.env.PAYMENT_SANDBOX || 'false').trim().toLowerCase() === 'true';

  return {
    provider,
    mode,
    sandboxEnabled,
    baseUrl: (process.env.CHAPA_BASE_URL || 'https://api.chapa.co').replace(/\/$/, ''),
    secretKey: (process.env.CHAPA_SECRET_KEY || '').trim(),
    callbackUrl: (process.env.CHAPA_CALLBACK_URL || '').trim(),
    returnUrl: (process.env.CHAPA_RETURN_URL || '').trim(),
    webhookSecret: (process.env.CHAPA_WEBHOOK_SECRET || '').trim(),
  };
};

const hasChapaConfig = () => {
  const config = getProviderConfig();
  return config.provider === 'chapa' && !!config.secretKey && !!config.callbackUrl && !!config.baseUrl;
};

const initializeChapaPayment = async ({ amount, currency = 'ETB', email, phone, paymentReference, callbackUrl, returnUrl, metadata = {} }) => {
  if (!hasChapaConfig()) return null;

  const config = getProviderConfig();
  const customizationDescription = `Rent payment - ${String(metadata.propertyTitle || 'rented property')}`.slice(0, 50);
  const configuredReturnUrl = config.returnUrl.replace(
    '{propertyId}',
    encodeURIComponent(String(metadata.propertyId || ''))
  );

  const { response, payload } = await fetchProviderJson(`${config.baseUrl}/v1/transaction/initialize`, {
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
      callback_url: callbackUrl || config.callbackUrl,
      return_url: returnUrl || configuredReturnUrl,
      customization: {
        title: 'RentalVerify',
        description: customizationDescription,
      },
      metadata,
    }),
  });

  if (!response.ok || !payload?.data?.checkout_url) {
    return {
      ok: false,
      provider: 'chapa',
      providerStatus: 'failed',
      providerMessage: payload?.message || 'Payment provider initialization failed',
      payload,
    };
  }

  return {
    ok: true,
    provider: 'chapa',
    providerStatus: 'initialized',
    providerReference: payload.data.reference || payload.data.tx_ref || paymentReference,
    providerCheckoutUrl: payload.data.checkout_url,
    providerPaymentId: payload.data.tx_ref || payload.data.reference || paymentReference,
    payload,
  };
};

const verifyChapaPayment = async (providerReference) => {
  if (!hasChapaConfig() || !providerReference) return null;

  const config = getProviderConfig();
  const { response, payload } = await fetchProviderJson(`${config.baseUrl}/v1/transaction/verify/${encodeURIComponent(providerReference)}`, {
    headers: { Authorization: `Bearer ${config.secretKey}` },
  });
  if (!response.ok) {
    return { ok: false, providerStatus: 'failed', providerMessage: payload?.message || 'Payment verification failed', payload };
  }

  return {
    ok: true,
    providerStatus: normalizeProviderStatus(payload?.data?.status || payload?.status),
    amount: payload?.data?.amount,
    currency: payload?.data?.currency,
    providerReference: payload?.data?.reference || payload?.data?.tx_ref || providerReference,
    providerPaymentId: payload?.data?.tx_ref || payload?.data?.reference || providerReference,
    payload,
  };
};

const verifyChapaWebhook = ({ body, rawBody, headers }) => {
  const config = getProviderConfig();
  const incomingSignature = (headers['x-chapa-signature'] || headers['x-chapa-signature'] || '').toString();

  if (!config.webhookSecret) {
    return { ok: false, reason: 'Missing CHAPA_WEBHOOK_SECRET' };
  }

  if (!incomingSignature) {
    return { ok: false, reason: 'Missing webhook signature' };
  }

  const payload = rawBody && rawBody.length > 0 ? rawBody : Buffer.from(JSON.stringify(body || {}));
  const expectedSignature = crypto.createHmac('sha256', config.webhookSecret)
    .update(payload)
    .digest('hex');

  if (expectedSignature !== incomingSignature) {
    return { ok: false, reason: 'Invalid webhook signature' };
  }

  return { ok: true, body };
};

const normalizeProviderStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (['success', 'successful', 'paid', 'completed'].includes(normalized)) return 'paid';
  if (['failed', 'declined', 'rejected'].includes(normalized)) return 'failed';
  if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
  if (['pending', 'in_progress', 'processing'].includes(normalized)) return 'pending';
  return normalized || 'pending';
};

module.exports = {
  getProviderConfig,
  hasChapaConfig,
  initializeChapaPayment,
  verifyChapaPayment,
  verifyChapaWebhook,
  normalizeProviderStatus,
};
