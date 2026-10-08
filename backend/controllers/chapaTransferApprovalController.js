const crypto = require('crypto');
const Payout = require('../models/Payout');
const { decryptBankAccountNumber } = require('../utils/bankAccountCrypto');

const verifyApprovalSignature = (signature, approvalSecret) => {
  if (!signature || !approvalSecret) return false;
  const expected = crypto
    .createHmac('sha256', approvalSecret)
    .update(approvalSecret)
    .digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected);
};

const toMinorUnits = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
};

const isMatchingTransferApproval = ({ payload, payout }) => {
  if (
    !payload ||
    !payout ||
    payout.mode !== 'live' ||
    payout.status !== 'PROCESSING' ||
    String(payload.reference || '').trim() !== payout.payoutReference ||
    toMinorUnits(payload.amount) !== toMinorUnits(payout.amount)
  ) {
    return false;
  }

  const approvedAccountNumber = String(payload.account_number || '').trim();
  const approvedAccountName = String(payload.account_name || '').trim().toLowerCase();
  const suppliedBank = String(payload.bank || payload.bank_code || '').trim().toLowerCase();
  if (!approvedAccountNumber || !approvedAccountName || !suppliedBank) return false;

  let savedAccountNumber;
  try {
    savedAccountNumber = decryptBankAccountNumber(payout.destinationAccountNumber);
  } catch {
    return false;
  }

  const supportedBankIdentifiers = [
    payout.destinationBankCode,
    payout.destinationBankName,
    payout.destinationBankSlug,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

  return approvedAccountNumber === savedAccountNumber &&
    approvedAccountName === String(payout.destinationAccountName || '').trim().toLowerCase() &&
    supportedBankIdentifiers.includes(suppliedBank);
};

const chapaTransferApproval = async (req, res) => {
  const approvalSecret = (process.env.CHAPA_TRANSFER_APPROVAL_SECRET || '').trim();
  if (!approvalSecret) {
    return res.status(503).json({ message: 'Chapa transfer approval is not configured.' });
  }

  const signature = req.get?.('Chapa-Signature') ||
    req.headers?.['chapa-signature'];
  if (!verifyApprovalSignature(signature, approvalSecret)) {
    return res.status(400).json({ message: 'Transfer approval signature is invalid.' });
  }

  const reference = String(req.body?.reference || '').trim();
  if (!reference) return res.status(400).json({ message: 'Transfer reference is required.' });

  try {
    const payoutQuery = Payout.findOne({
      payoutReference: reference,
      mode: 'live',
      status: 'PROCESSING',
    });
    const payout = await payoutQuery.select('+destinationAccountNumber');
    if (!isMatchingTransferApproval({ payload: req.body, payout })) {
      return res.status(400).json({ message: 'Transfer details do not match the submitted payout.' });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[PAYOUT] Chapa transfer approval could not be validated:', error.message);
    return res.status(500).json({ message: 'Unable to validate transfer approval.' });
  }
};

module.exports = {
  chapaTransferApproval,
  isMatchingTransferApproval,
  verifyApprovalSignature,
};
