const test = require('node:test');
const assert = require('node:assert/strict');
const Payout = require('../models/Payout');
const { DEMO_PAYOUT_MESSAGE, getPayoutEligibility } = require('../services/payoutEligibility');

const completeAccount = {
  bankAccountName: 'Landlord Example',
  bankAccountNumber: 'encrypted-value',
  bankCode: 'supported-bank-code',
  bankAccountConfigured: true,
};

test('demo accounts are never eligible for a real payout', () => {
  const result = getPayoutEligibility({
    ...completeAccount,
    bankAccountSource: 'demo',
    bankAccountVerified: false,
  });

  assert.deepEqual(result, { eligible: false, message: DEMO_PAYOUT_MESSAGE });
});

test('a registered real existing account is eligible for Chapa payout', () => {
  assert.deepEqual(getPayoutEligibility({
    ...completeAccount,
    bankAccountSource: 'existing_account',
    bankAccountVerified: false,
  }), { eligible: true, message: '' });
});

test('bank API accounts require explicit bank confirmation before payout', () => {
  assert.equal(getPayoutEligibility({
    ...completeAccount,
    bankAccountSource: 'bank_api',
    bankAccountVerified: false,
  }).eligible, false);

  assert.equal(getPayoutEligibility({
    ...completeAccount,
    bankAccountSource: 'bank_api',
    bankAccountVerified: true,
  }).eligible, true);
});

test('a unique payout-per-payment database constraint preserves duplicate payout protection', () => {
  assert.equal(Payout.schema.path('payment').options.unique, true);
});
