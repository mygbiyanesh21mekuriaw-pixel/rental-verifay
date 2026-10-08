const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Payout = require('../models/Payout');
const { encryptBankAccountNumber } = require('../utils/bankAccountCrypto');
const {
  chapaTransferApproval,
  isMatchingTransferApproval,
  verifyApprovalSignature,
} = require('../controllers/chapaTransferApprovalController');

const approvalSecret = 'test-only-approval-secret';
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-encryption-secret';
const payout = {
  payoutReference: 'PO-approval-123',
  mode: 'live',
  status: 'PROCESSING',
  amount: 3000,
  destinationBankCode: 'CBE',
  destinationBankName: 'Commercial Bank of Ethiopia',
  destinationBankSlug: 'commercial-bank-of-ethiopia',
  destinationAccountName: 'Landlord Example',
  destinationAccountNumber: encryptBankAccountNumber('00123456789'),
};
const body = {
  reference: 'PO-approval-123',
  amount: '3000.00',
  bank: 'commercial-bank-of-ethiopia',
  account_name: 'Landlord Example',
  account_number: '00123456789',
};
const signature = crypto
  .createHmac('sha256', approvalSecret)
  .update(approvalSecret)
  .digest('hex');

test.after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test('Chapa server approval authenticates its signature and exact saved payout destination', async () => {
  const previousSecret = process.env.CHAPA_TRANSFER_APPROVAL_SECRET;
  const previousFindOne = Payout.findOne;
  process.env.CHAPA_TRANSFER_APPROVAL_SECRET = approvalSecret;
  let queried = false;
  Payout.findOne = (filter) => {
    queried = true;
    assert.deepEqual(filter, {
      payoutReference: body.reference,
      mode: 'live',
      status: 'PROCESSING',
    });
    return { select: async (fields) => {
      assert.equal(fields, '+destinationAccountNumber');
      return payout;
    } };
  };

  try {
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(value) {
        this.body = value;
        return this;
      },
    };
    await chapaTransferApproval({
      body,
      headers: { 'chapa-signature': signature },
      get: (header) => header === 'Chapa-Signature' ? signature : undefined,
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(queried, true);
    assert.equal(payout.status, 'PROCESSING');
  } finally {
    Payout.findOne = previousFindOne;
    if (previousSecret === undefined) delete process.env.CHAPA_TRANSFER_APPROVAL_SECRET;
    else process.env.CHAPA_TRANSFER_APPROVAL_SECRET = previousSecret;
  }
});

test('Chapa server approval rejects mismatched or incomplete payout details', () => {
  assert.equal(verifyApprovalSignature(signature, approvalSecret), true);
  assert.equal(verifyApprovalSignature('invalid', approvalSecret), false);
  assert.equal(isMatchingTransferApproval({ payload: { ...body, amount: '2999' }, payout }), false);
  assert.equal(isMatchingTransferApproval({ payload: { ...body, account_number: '99999' }, payout }), false);
  assert.equal(isMatchingTransferApproval({ payload: { ...body, bank: 'AWASH' }, payout }), false);
  assert.equal(isMatchingTransferApproval({
    payload: body,
    payout: { ...payout, status: 'PAID' },
  }), false);
});
