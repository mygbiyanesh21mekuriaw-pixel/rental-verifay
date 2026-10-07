const LandlordCredit = require('../models/LandlordCredit');
const Payment = require('../models/Payment');
const Property = require('../models/Property');
const User = require('../models/User');

const isConfirmedRentPayment = (payment) => Boolean(
  payment?.status === 'paid' &&
  payment?.verifiedAt &&
  payment?.provider === 'chapa' &&
  payment?.providerReference === payment?.paymentReference &&
  String(payment?.providerTransactionReference || '').trim() &&
  Number.isFinite(Number(payment?.amount)) &&
  Number(payment.amount) > 0
);

const toLedgerEntry = (payment, landlord, status, reason = '') => ({
  landlord: landlord._id,
  payment: payment._id,
  tenant: payment.tenant,
  property: payment.property,
  amount: Number(payment.amount),
  currency: payment.currency || 'ETB',
  type: 'RENT_PAYMENT_CREDIT',
  provider: payment.provider,
  paymentMode: payment.paymentMode,
  paymentReference: payment.paymentReference,
  providerTransactionReference: payment.providerTransactionReference,
  bankName: landlord.bankName || '',
  bankCode: landlord.bankCode || '',
  bankAccountName: landlord.bankAccountName || '',
  status,
  reason,
  creditedAt: status === 'CREDITED' ? payment.verifiedAt : null,
});

const hasSavedBankAccount = (landlord) => Boolean(
  landlord?.bankAccountName?.trim() &&
  landlord?.bankAccountNumber?.trim() &&
  landlord?.bankCode?.trim() &&
  landlord?.bankAccountConfigured !== false &&
  landlord?.bankAccountSource !== 'demo'
);

const findPaymentCreditReference = (landlord, payment) =>
  landlord?.internalCreditReferences?.find(
    (reference) => String(reference.payment) === String(payment._id)
  );

const hasProviderReferenceForDifferentPayment = (landlord, payment) =>
  landlord?.internalCreditReferences?.some(
    (reference) =>
      reference.providerTransactionReference === payment.providerTransactionReference &&
      String(reference.payment) !== String(payment._id)
  );

const getCreditResult = (credit, alreadyCredited = false) => ({
  status: credit.status,
  credit,
  alreadyCredited,
  reason: credit.reason || '',
});

const saveLedgerState = async (payment, landlord, status, reason = '') =>
  LandlordCredit.findOneAndUpdate(
    { payment: payment._id },
    {
      $set: toLedgerEntry(payment, landlord, status, reason),
      $setOnInsert: { externalTransferStatus: 'NOT_EXECUTED' },
    },
    { upsert: true, new: true, runValidators: true }
  );

const creditLandlordForPayment = async (payment) => {
  if (!isConfirmedRentPayment(payment)) {
    return { status: 'PENDING', credit: null, reason: 'Tenant payment is not verified as paid.' };
  }

  let landlord;
  try {
    const property = await Property.findById(payment.property).select('landlord');
    landlord = await User.findById(payment.landlord)
      .select('+bankAccountNumber bankAccountName bankCode bankName bankAccountConfigured bankAccountSource internalBalance internalCreditReferences role');

    if (
      !property ||
      String(property.landlord) !== String(payment.landlord) ||
      !landlord ||
      landlord.role !== 'landlord'
    ) {
      throw new Error('Rent payment property owner does not match the payment landlord.');
    }

    const existingCredit = await LandlordCredit.findOne({ payment: payment._id });
    if (existingCredit?.status === 'CREDITED') {
      return getCreditResult(existingCredit, true);
    }

    const existingReference = findPaymentCreditReference(landlord, payment);
    if (existingReference) {
      const repairedCredit = await saveLedgerState(payment, landlord, 'CREDITED');
      return getCreditResult(repairedCredit, true);
    }

    if (hasProviderReferenceForDifferentPayment(landlord, payment)) {
      const failedCredit = await saveLedgerState(
        payment,
        landlord,
        'FAILED',
        'Provider transaction reference is already associated with another payment.'
      );
      return getCreditResult(failedCredit);
    }

    if (!hasSavedBankAccount(landlord)) {
      const pendingCredit = await saveLedgerState(
        payment,
        landlord,
        'PENDING',
        'Landlord saved bank account is not configured.'
      );
      return getCreditResult(pendingCredit);
    }

    const creditedAt = payment.verifiedAt;
    const updatedLandlord = await User.findOneAndUpdate(
      {
        _id: landlord._id,
        role: 'landlord',
        bankAccountConfigured: { $ne: false },
        bankAccountName: { $ne: '' },
        bankAccountNumber: { $ne: '' },
        bankCode: { $ne: '' },
        $nor: [
          { 'internalCreditReferences.payment': payment._id },
          { 'internalCreditReferences.providerTransactionReference': payment.providerTransactionReference },
        ],
      },
      {
        $inc: { internalBalance: Number(payment.amount) },
        $push: {
          internalCreditReferences: {
            payment: payment._id,
            providerTransactionReference: payment.providerTransactionReference,
            amount: Number(payment.amount),
            creditedAt,
          },
        },
      },
      { new: true, runValidators: true }
    );

    if (updatedLandlord) {
      const credit = await saveLedgerState(payment, updatedLandlord, 'CREDITED');
      return getCreditResult(credit);
    }

    const currentLandlord = await User.findById(payment.landlord)
      .select('+bankAccountNumber bankAccountName bankCode bankName bankAccountConfigured bankAccountSource internalBalance internalCreditReferences role');
    const currentReference = findPaymentCreditReference(currentLandlord, payment);
    if (currentReference) {
      const repairedCredit = await saveLedgerState(payment, currentLandlord, 'CREDITED');
      return getCreditResult(repairedCredit, true);
    }
    if (hasProviderReferenceForDifferentPayment(currentLandlord, payment)) {
      const failedCredit = await saveLedgerState(
        payment,
        currentLandlord,
        'FAILED',
        'Provider transaction reference is already associated with another payment.'
      );
      return getCreditResult(failedCredit);
    }
    if (!hasSavedBankAccount(currentLandlord)) {
      const pendingCredit = await saveLedgerState(
        payment,
        currentLandlord,
        'PENDING',
        'Landlord saved bank account is not configured.'
      );
      return getCreditResult(pendingCredit);
    }

    const failedCredit = await saveLedgerState(
      payment,
      currentLandlord,
      'FAILED',
      'Payment reference was already credited or the landlord balance could not be updated.'
    );
    return getCreditResult(failedCredit);
  } catch (error) {
    console.error('[LANDLORD CREDIT] Credit processing failed:', error.message);
    if (landlord) {
      const persistedLandlord = await User.findById(payment.landlord)
        .select('+bankAccountNumber bankAccountName bankCode bankName bankAccountConfigured bankAccountSource internalBalance internalCreditReferences role');
      if (findPaymentCreditReference(persistedLandlord, payment)) {
        const repairedCredit = await saveLedgerState(payment, persistedLandlord, 'CREDITED');
        return getCreditResult(repairedCredit, true);
      }
    }
    const failureLandlord = landlord || await User.findById(payment.landlord).select('role');
    if (!failureLandlord || failureLandlord.role !== 'landlord') throw error;
    const failedCredit = await saveLedgerState(payment, failureLandlord, 'FAILED', error.message);
    return getCreditResult(failedCredit);
  }
};

const retryLandlordCredits = async (landlordId) => {
  const payments = await Payment.find({
    landlord: landlordId,
    provider: 'chapa',
    status: 'paid',
    verifiedAt: { $ne: null },
  });
  const results = [];
  for (const payment of payments) {
    results.push(await creditLandlordForPayment(payment));
  }
  return results;
};

module.exports = {
  creditLandlordForPayment,
  isConfirmedRentPayment,
  retryLandlordCredits,
};
