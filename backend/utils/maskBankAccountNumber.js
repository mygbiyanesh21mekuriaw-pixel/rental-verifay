const maskBankAccountNumber = (accountNumber) => {
  const value = String(accountNumber || '');
  if (!value) return '';
  if (value.length <= 4) return '******';

  return `${'*'.repeat(Math.max(6, value.length - 4))}${value.slice(-4)}`;
};

module.exports = maskBankAccountNumber;
