const DEMO_BANKS = [
  {
    code: 'CBE',
    name: 'Commercial Bank of Ethiopia (CBE)',
    accountNumberFormat: 'numeric',
    accountNumberLength: 13,
    accountNumberPrefix: '100',
  },
  { code: 'AWASH', name: 'Awash Bank', accountNumberFormat: 'numeric', accountNumberLength: 14 },
  { code: 'CBO', name: 'Cooperative Bank of Oromia (CBO)', accountNumberFormat: 'numeric', accountNumberLength: 12 },
  { code: 'HIBRET', name: 'Hibret Bank', accountNumberFormat: 'numeric', accountNumberLength: 11 },
  { code: 'ZEMEN', name: 'Zemen Bank', accountNumberFormat: 'numeric', accountNumberLength: 12 },
  { code: 'MPESA', name: 'M-Pesa', accountNumberFormat: 'numeric', accountNumberLength: 10 },
  { code: 'YAYA', name: 'YaYa Wallet', accountNumberFormat: 'numeric', accountNumberLength: 10 },
  { code: 'TELEBIRR', name: 'telebirr', accountNumberFormat: 'numeric', accountNumberLength: 10 },
];

module.exports = DEMO_BANKS;
