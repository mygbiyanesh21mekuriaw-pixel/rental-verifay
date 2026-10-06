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
      message: 'Landlord payout bank details are incomplete.',
    };
  }

  if (landlord.bankAccountConfigured === false) {
    return {
      eligible: false,
      message: 'Landlord payout account is not configured for real payouts.',
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
    message: 'Landlord payout account is not verified for real payouts.',
  };
};

module.exports = { DEMO_PAYOUT_MESSAGE, getPayoutEligibility };
