const test = require('node:test');
const assert = require('node:assert/strict');
const DemoBankAccount = require('../models/DemoBankAccount');
const { getMyDemoAccount } = require('../controllers/bankAccountController');

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('account lookup succeeds with a null account when landlord has not created one', async () => {
  const originalFindOne = DemoBankAccount.findOne;
  let query;
  DemoBankAccount.findOne = async (filter) => {
    query = filter;
    return null;
  };
  const response = createResponse();

  try {
    await getMyDemoAccount(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.deepEqual(query, { landlord: 'landlord-id', status: 'active' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { success: true, account: null });
  } finally {
    DemoBankAccount.findOne = originalFindOne;
  }
});

test('account lookup returns the active landlord account in the success response', async () => {
  const originalFindOne = DemoBankAccount.findOne;
  DemoBankAccount.findOne = async () => ({
    _id: 'account-id',
    bankName: 'Commercial Bank of Ethiopia (CBE)',
    bankCode: 'CBE',
    accountName: 'Dejen Mulat',
    accountNumber: '1000000000001',
    balance: 0,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const response = createResponse();

  try {
    await getMyDemoAccount(
      { user: { id: 'landlord-id', role: 'landlord' } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.account.accountNumber, '1000000000001');
    assert.equal(response.body.account.bankCode, 'CBE');
  } finally {
    DemoBankAccount.findOne = originalFindOne;
  }
});
