const LandlordCredit = require('../models/LandlordCredit');
const Payout = require('../models/Payout');
const User = require('../models/User');
const { decryptBankAccountNumber } = require('../utils/bankAccountCrypto');
const {
  createPayoutReference,
  hasTransferConfig,
  initiateChapaTransfer,
  listChapaBanks,
  verifyChapaTransfer,
  isSandboxTransferMode,
} = require('../utils/payoutProvider');

const toExternalTransferStatus = (status, mode = 'live') => {
  if (mode === 'sandbox' || status === 'SIMULATED') return 'NOT_EXECUTED';
  if (status === 'PAID') return 'EXECUTED';
  if (status === 'PROCESSING') return 'PENDING';
  if (['FAILED', 'REVERTED'].includes(status)) return status;
  return 'NOT_EXECUTED';
};

const setPayoutStatus = async (payout, status, fields = {}) => {
  const updatedPayout = await Payout.findOneAndUpdate(
    { _id: payout._id },
    { $set: { status, ...fields } },
    { new: true, runValidators: true }
  );
  if (!updatedPayout) {
    throw new Error(`Unable to persist payout status for ${payout.payoutReference}.`);
  }
  await LandlordCredit.updateOne(
    { payment: payout.payment },
    {
      $set: {
        externalTransferStatus: toExternalTransferStatus(status, payout.mode),
        ...(payout.mode === 'sandbox' && fields.sandboxTransferStatus
          ? { sandboxTransferStatus: fields.sandboxTransferStatus }
          : {}),
      },
    }
  );
  return updatedPayout;
};

const reserveLandlordBalance = async (payout) => {
  const amount = Number(payout.amount);
  const landlordId = payout.landlord;
  const existingLandlord = await User.findById(landlordId)
    .select('internalBalance internalPayoutReferences');
  const existingReference = existingLandlord?.internalPayoutReferences?.find(
    (reference) => reference.payoutReference === payout.payoutReference
  );
  if (existingReference) return existingReference.status === 'RESERVED';

  const updatedLandlord = await User.findOneAndUpdate(
    {
      _id: landlordId,
      internalBalance: { $gte: amount },
      'internalPayoutReferences.payoutReference': { $ne: payout.payoutReference },
    },
    {
      $inc: { internalBalance: -amount },
      $push: {
        internalPayoutReferences: {
          payoutReference: payout.payoutReference,
          amount,
          status: 'RESERVED',
          createdAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (updatedLandlord) return true;

  const landlordAfterAttempt = await User.findById(landlordId)
    .select('internalPayoutReferences');
  return landlordAfterAttempt?.internalPayoutReferences?.some(
    (reference) =>
      reference.payoutReference === payout.payoutReference &&
      reference.status === 'RESERVED'
  ) || false;
};

const releaseLandlordBalance = async (payout) => {
  await User.findOneAndUpdate(
    {
      _id: payout.landlord,
      internalPayoutReferences: {
        $elemMatch: {
          payoutReference: payout.payoutReference,
          status: 'RESERVED',
        },
      },
    },
    {
      $inc: { internalBalance: Number(payout.amount) },
      $set: { 'internalPayoutReferences.$.status': 'REFUNDED' },
    },
    { new: true, runValidators: true }
  );
};

const settleLandlordBalance = async (payout) => {
  const settledLandlord = await User.findOneAndUpdate(
    {
      _id: payout.landlord,
      internalPayoutReferences: {
        $elemMatch: {
          payoutReference: payout.payoutReference,
          status: 'RESERVED',
        },
      },
    },
    { $set: { 'internalPayoutReferences.$.status': 'EXECUTED' } },
    { new: true, runValidators: true }
  );
  if (settledLandlord) return;

  const landlord = await User.findById(payout.landlord)
    .select('internalPayoutReferences');
  const reference = landlord?.internalPayoutReferences?.find(
    (entry) => entry.payoutReference === payout.payoutReference
  );
  if (reference?.status === 'EXECUTED' || !reference) return;
  if (reference.status === 'RESERVED') {
    throw new Error(`Unable to settle the reserved balance for payout ${payout.payoutReference}.`);
  }
  console.error(`[PAYOUT] Transfer ${payout.payoutReference} succeeded after its landlord balance reservation was released.`);
};

const updateFromProviderVerification = async (payout, verification) => {
  const verifiedStatus = verification?.ok ? verification.status : '';
  const status = ['PAID', 'FAILED', 'REVERTED'].includes(verifiedStatus)
    ? verifiedStatus
    : 'PROCESSING';
  const verifiedAt = new Date();
  const sandboxMode = payout.mode === 'sandbox';
  const terminalFailure = ['FAILED', 'REVERTED'].includes(status);
  if (!sandboxMode && status === 'PAID') await settleLandlordBalance(payout);
  else if (terminalFailure) await releaseLandlordBalance(payout);
  const savedStatus = sandboxMode && status !== 'PROCESSING' ? 'SIMULATED' : status;
  if (terminalFailure) {
    console.error(
      `[PAYOUT] Chapa confirmed ${status.toLowerCase()} reference=${payout.providerReference || payout.payoutReference} message=${verification.message || 'No provider reason supplied.'}`
    );
  }
  const updatedPayout = await setPayoutStatus(payout, savedStatus, {
    providerReference: verification?.providerReference || payout.providerReference || payout.payoutReference,
    providerVerificationResponse: verification?.responseDetails || null,
    lastVerifiedAt: verifiedAt,
    sandboxTransferStatus: sandboxMode
      ? (status === 'PAID' ? 'SUCCEEDED' : terminalFailure ? 'FAILED' : 'PROCESSING')
      : undefined,
    failureReason: sandboxMode
      ? status === 'PAID'
        ? 'Chapa sandbox simulated a successful transfer; no real bank funds were moved.'
        : terminalFailure
          ? (verification.message || 'Chapa sandbox simulated a failed transfer; no real bank funds were moved.')
          : (verification.message || 'Chapa sandbox transfer is awaiting final confirmation; no real bank funds were moved.')
      : terminalFailure
        ? (verification.message || 'Chapa reported that the transfer did not complete.')
        : '',
  });
  return updatedPayout;
};

const processLandlordPayout = async (payment) => {
  const paymentMode = payment?.paymentMode;
  if (
    !payment ||
    payment.status !== 'paid' ||
    !payment.verifiedAt ||
    !['live', 'sandbox'].includes(paymentMode) ||
    payment.provider !== 'chapa' ||
    payment.providerReference !== payment.paymentReference ||
    !String(payment.providerTransactionReference || '').trim()
  ) {
    return null;
  }
  if ((paymentMode === 'sandbox') !== isSandboxTransferMode()) {
    console.warn(
      `[PAYOUT] Skipped payment ${payment.paymentReference}: payment mode does not match the configured Chapa mode.`
    );
    return null;
  }

  const credit = await LandlordCredit.findOne({ payment: payment._id });
  if (credit?.status !== 'CREDITED') return null;

  let payout = await Payout.findOne({ payment: payment._id });
  if (!payout) {
    try {
      payout = await Payout.findOneAndUpdate(
        { payment: payment._id },
        {
          $setOnInsert: {
            payment: payment._id,
            tenant: payment.tenant,
            landlord: payment.landlord,
            property: payment.property,
            amount: payment.amount,
            currency: payment.currency || 'ETB',
            mode: paymentMode,
            paymentReference: payment.paymentReference,
            payoutReference: createPayoutReference(),
            status: 'PENDING',
          },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      payout = await Payout.findOne({ payment: payment._id });
      if (!payout) throw error;
    }
  }
  if (!payout) throw new Error('Unable to create or load the landlord payout record.');

  if (['PAID', 'FAILED', 'REVERTED', 'SIMULATED'].includes(payout.status)) {
    if (payout.status !== 'PAID') await releaseLandlordBalance(payout);
    await LandlordCredit.updateOne(
      { payment: payout.payment },
      { $set: { externalTransferStatus: toExternalTransferStatus(payout.status, payout.mode) } }
    );
    return payout;
  }

  if (payout.status === 'PROCESSING') {
    try {
      const verification = await verifyChapaTransfer(
        payout.providerReference || payout.payoutReference,
        { amount: payout.amount, currency: payout.currency }
      );
      return updateFromProviderVerification(payout, verification);
    } catch (error) {
      console.error(`[PAYOUT] Transfer verification failed for ${payout.payoutReference}:`, error.message);
      return setPayoutStatus(payout, 'PROCESSING', {
        failureReason: 'Transfer status could not be verified. It will be checked again before any new transfer request.',
      });
    }
  }

  if (payout.status !== 'PENDING') return payout;
  if (!hasTransferConfig()) {
    return setPayoutStatus(payout, 'PENDING', {
      failureReason: 'Chapa transfer configuration is missing. Configure the backend Chapa secret key and transfer access.',
    });
  }

  const banksResult = await listChapaBanks();
  if (!banksResult.ok) {
    return setPayoutStatus(payout, 'PENDING', {
      failureReason: banksResult.message || 'Chapa bank details could not be validated.',
    });
  }

  const landlord = await User.findById(payout.landlord)
    .select('+bankAccountNumber bankAccountName bankCode bankName bankAccountConfigured bankAccountSource');
  if (
    !landlord ||
    landlord.bankAccountConfigured === false ||
    landlord.bankAccountSource === 'demo' ||
    !landlord.bankAccountName?.trim() ||
    !landlord.bankCode?.trim() ||
    !landlord.bankAccountNumber?.trim()
  ) {
    return setPayoutStatus(payout, 'PENDING', {
      failureReason: 'A complete, non-demo landlord bank account is required for payout.',
    });
  }

  if (!banksResult.banks.some((bank) => bank.code === landlord.bankCode)) {
    return setPayoutStatus(payout, 'PENDING', {
      failureReason: 'The registered bank is not currently supported for Chapa payouts. Update the bank account to continue.',
    });
  }

  const amount = Number(payout.amount);
  if (!Number.isFinite(amount) || amount <= 0 || payout.currency !== 'ETB') {
    return setPayoutStatus(payout, 'FAILED', {
      failureReason: 'The payout amount or currency is invalid.',
    });
  }

  let accountNumber;
  try {
    accountNumber = decryptBankAccountNumber(landlord.bankAccountNumber);
  } catch (error) {
    console.error(`[PAYOUT] Unable to decrypt bank account for ${payout.payoutReference}:`, error.message);
    return setPayoutStatus(payout, 'PENDING', {
      failureReason: 'Landlord bank account could not be decrypted. Verify the server encryption configuration.',
    });
  }

  if (!accountNumber.trim()) {
    return setPayoutStatus(payout, 'PENDING', {
      failureReason: 'Landlord bank account number is empty.',
    });
  }

  const sandboxMode = payout.mode === 'sandbox';
  const sandboxTestStatus = String(process.env.CHAPA_TRANSFER_TEST_STATUS || 'success')
    .trim()
    .toLowerCase();
  if (
    sandboxMode &&
    !['success', 'failed', 'pending'].includes(sandboxTestStatus)
  ) {
    return setPayoutStatus(payout, 'PENDING', {
      failureReason: 'CHAPA_TRANSFER_TEST_STATUS must be success, failed, or pending.',
    });
  }

  if (!sandboxMode && !await reserveLandlordBalance(payout)) {
    return setPayoutStatus(payout, 'FAILED', {
      failureReason: 'Insufficient landlord balance to reserve this payout.',
    });
  }

  const claimedPayout = await Payout.findOneAndUpdate(
    { _id: payout._id, status: 'PENDING' },
    {
      $set: {
        status: 'PROCESSING',
        failureReason: '',
        transferAttemptedAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  );
  if (!claimedPayout) {
    const currentPayout = await Payout.findById(payout._id);
    if (currentPayout?.status === 'PROCESSING') {
      try {
        const verification = await verifyChapaTransfer(
          currentPayout.providerReference || currentPayout.payoutReference,
          { amount: currentPayout.amount, currency: currentPayout.currency }
        );
        return updateFromProviderVerification(currentPayout, verification);
      } catch (error) {
        console.error(`[PAYOUT] Transfer verification failed for ${currentPayout.payoutReference}:`, error.message);
        return currentPayout;
      }
    }
    return currentPayout;
  }

  let transfer;
  try {
    transfer = await initiateChapaTransfer({
      accountName: landlord.bankAccountName,
      accountNumber,
      amount,
      bankCode: landlord.bankCode,
      reference: claimedPayout.payoutReference,
      ...(sandboxMode ? { testStatus: sandboxTestStatus } : {}),
    });
  } catch (error) {
    console.error(`[PAYOUT] Transfer request outcome is unknown for ${claimedPayout.payoutReference}:`, error.message);
    return setPayoutStatus(claimedPayout, 'PROCESSING', {
      providerReference: claimedPayout.payoutReference,
      failureReason: `Chapa transfer request outcome is unknown: ${error.message}. The reference will be checked before another request is considered.`,
    });
  }

  if (!transfer?.ok) {
    const status = sandboxMode ? 'SIMULATED' : 'FAILED';
    console.error(
      `[PAYOUT] Chapa transfer request rejected reference=${claimedPayout.payoutReference} httpStatus=${transfer?.responseDetails?.httpStatus ?? 'unknown'} apiStatus=${transfer?.responseDetails?.apiStatus || 'unknown'} message=${transfer?.message || 'Chapa rejected the transfer request.'}`
    );
    const failedPayout = await setPayoutStatus(claimedPayout, status, {
      providerReference: transfer?.providerReference || claimedPayout.payoutReference,
      providerRequestResponse: transfer?.responseDetails || null,
      sandboxTransferStatus: sandboxMode ? 'FAILED' : undefined,
      failureReason: sandboxMode
        ? `Chapa sandbox transfer simulation failed: ${transfer?.message || 'Chapa rejected the transfer request.'} No real bank funds were moved.`
        : (transfer?.message || 'Chapa rejected the transfer request.'),
    });
    if (!sandboxMode) await releaseLandlordBalance(failedPayout);
    return failedPayout;
  }

  const submittedPayout = await setPayoutStatus(claimedPayout, 'PROCESSING', {
    providerReference: transfer?.providerReference || claimedPayout.payoutReference,
    providerRequestResponse: transfer?.responseDetails || null,
    failureReason: '',
  });
  try {
    const verification = await verifyChapaTransfer(
      submittedPayout.providerReference || submittedPayout.payoutReference,
      { amount: submittedPayout.amount, currency: submittedPayout.currency }
    );
    return updateFromProviderVerification(submittedPayout, verification);
  } catch (error) {
    console.error(`[PAYOUT] Transfer verification failed for ${submittedPayout.payoutReference}:`, error.message);
    return setPayoutStatus(submittedPayout, 'PROCESSING', {
      failureReason: `Chapa accepted the transfer request but verification failed: ${error.message}. It will be checked again.`,
    });
  }
};

module.exports = {
  processLandlordPayout,
  toExternalTransferStatus,
};
