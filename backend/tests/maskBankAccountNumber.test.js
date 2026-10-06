const test = require('node:test');
const assert = require('node:assert/strict');
const maskBankAccountNumber = require('../utils/maskBankAccountNumber');

test('masks real account numbers and never returns a short number in full', () => {
  assert.equal(maskBankAccountNumber('0012345678'), '******5678');
  assert.equal(maskBankAccountNumber('1234'), '******');
  assert.equal(maskBankAccountNumber(''), '');
});
