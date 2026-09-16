const crypto = require('crypto');

const TRANSFER_TIMEOUT_MS = 15000;

const transferConfig = () => ({
  provider: (process.env.PAYMENT_PROVIDER || '').trim().toLowerCase(),
  baseUrl: (process.env.CHAPA_BASE_URL || 'https://api.chapa.co').replace(/\/$/, ''),
  secretKey: (process.env.CHAPA_SECRET_KEY || '').trim(),
});

const hasTransferConfig = () => {
  const config = transferConfig();
  return config.provider === 'chapa' && Boolean(config.secretKey && config.baseUrl);
};

const fetchTransferJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSFER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeTransferStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['success', 'successful', 'paid', 'completed'].includes(normalized)) return 'PAID';
  if (['failed', 'declined', 'rejected'].includes(normalized)) return 'FAILED';
  if (['reverted', 'reversed'].includes(normalized)) return 'REVERTED';
  if (['pending', 'processing', 'queued', 'initiated'].includes(normalized)) return 'PROCESSING';
  return 'PENDING';
};

const initiateChapaTransfer = async ({ accountName, accountNumber, amount, bankCode, reference }) => {
  if (!hasTransferConfig()) return { ok: false, status: 'FAILED', message: 'Chapa transfer configuration is missing' };
  const config = transferConfig();
  const { response, payload } = await fetchTransferJson(`${config.baseUrl}/v1/transfers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_name: accountName,
      account_number: accountNumber,
      amount: Number(amount).toFixed(2),
      currency: 'ETB',
      reference,
      bank_code: bankCode,
    }),
  });
  const data = payload?.data || {};
  const providerReference = data.reference || data.tx_ref || payload?.reference || reference;
  return {
    ok: response.ok && (payload?.status === undefined || payload.status === 'success' || payload.status === 'successful'),
    status: normalizeTransferStatus(data.status || payload?.status),
    providerReference,
    message: payload?.message || payload?.error || 'Transfer request failed',
    payload,
  };
};

const verifyChapaTransfer = async (reference) => {
  if (!hasTransferConfig() || !reference) return { ok: false, status: 'PENDING', message: 'Chapa transfer configuration is missing' };
  const config = transferConfig();
  const { response, payload } = await fetchTransferJson(`${config.baseUrl}/v1/transfers/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.secretKey}` },
  });
  const data = payload?.data || {};
  return {
    ok: response.ok,
    status: normalizeTransferStatus(data.status || payload?.status),
    providerReference: data.reference || data.tx_ref || reference,
    message: payload?.message || payload?.error || '',
    payload,
  };
};

const listChapaBanks = async () => {
  if (!hasTransferConfig()) return { ok: false, banks: [], message: 'Chapa transfer configuration is missing' };
  const config = transferConfig();
  const { response, payload } = await fetchTransferJson(`${config.baseUrl}/v1/banks`, {
    headers: { Authorization: `Bearer ${config.secretKey}` },
  });
  const records = Array.isArray(payload?.data) ? payload.data : [];
  const banks = records.map((bank) => ({
    name: bank.name || bank.bank_name || bank.bankName,
    code: String(bank.bank_code ?? bank.code ?? bank.id ?? '').trim(),
  })).filter((bank) => bank.name && bank.code);
  return { ok: response.ok, banks, message: payload?.message || '' };
};

const createPayoutReference = () => `PO-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

module.exports = { hasTransferConfig, initiateChapaTransfer, verifyChapaTransfer, listChapaBanks, createPayoutReference, normalizeTransferStatus };
