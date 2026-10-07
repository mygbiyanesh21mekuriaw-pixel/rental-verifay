const DEMO_PAYOUT_MESSAGE = 'Demo bank account cannot receive real payouts.';

const getPayoutEligibility = (landlord) => {
  if (landlord?.bankAccountSource === 'demo') {
    return { eligible: false, message: DEMO_PAYOUT_MESSAGE };
  }

  const hasAccountDetails = Boolean(
    landlord?.bankAccountName?.trim() &&
    landlord?.bankAccountNumber?.trim() &&
    landlord?.bankCode?.trim()
  );
  if (!hasAccountDetails) {
    return {
      eligible: false,
      message: 'The landlord has not registered a complete bank account.',
    };
  }

  if (landlord.bankAccountConfigured === false) {
    return {
      eligible: false,
      message: 'The landlord bank account is not configured.',
    };
  }

  if (landlord.bankAccountSource === 'existing_account') {
    return { eligible: true, message: '' };
  }

  if (
    landlord.bankAccountSource === 'bank_api' &&
    landlord.bankAccountVerified === true &&
    landlord.bankAccountConfigured === true
  ) {
    return { eligible: true, message: '' };
  }

  return {
    eligible: false,
    message: 'The landlord bank account is not verified.',
  };
};

module.exports = { DEMO_PAYOUT_MESSAGE, getPayoutEligibility };
