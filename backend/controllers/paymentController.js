const crypto = require('crypto');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { createSystemLog } = require('./systemLogController');

const {
  getProviderConfig,
  hasChapaConfig,
  initializeChapaPayment,
  verifyChapaPayment,
  validateChapaPaymentVerification,
} = require('../utils/paymentProvider');

const {
  hasTransferConfig,
  initiateChapaTransfer,
  verifyChapaTransfer,
  listChapaBanks,
  createPayoutReference,
} = require('../utils/payoutProvider');
const { decryptBankAccountNumber } = require('../utils/bankAccountCrypto');


const getChapaBanks = async (req, res) => {
  try {
    if (req.user.role !== 'landlord') {
      return res.status(403).json({ message: 'Landlords only' });
    }

    const result = await listChapaBanks();

    if (!result.ok) {
      return res.status(503).json({
        message: result.message || 'Unable to load supported banks',
      });
    }

    res.json(result.banks);
  } catch (error) {
    console.error('Get Chapa banks error:', error.message);
    res.status(502).json({
      message: 'Unable to load supported banks',
    });
  }
};


const paymentView = (query) =>
  query
    .populate('tenant', 'name email phone')
    .populate('landlord', 'name email phone')
    .populate('property', 'title location price')
    .populate('rentalRequest', 'status');

const paymentResponse = (payment) => {
  const record = payment?.toObject ? payment.toObject() : { ...payment };
  return {
    ...record,
    isVerified: isVerifiedPayment(payment),
  };
};


const getConfirmedRental = async (propertyId, tenantId) => {
  const request = await RentalRequest.findOne({
    property: propertyId,
    tenant: tenantId,
    status: { $in: ['approved', 'confirmed'] },
  });

  return request;
};

const isVerifiedPayment = (payment) => Boolean(
  payment?.status === 'paid' &&
  payment?.verifiedAt &&
  payment?.provider === 'chapa' &&
  payment?.providerReference &&
  payment.providerReference === payment.paymentReference &&
  payment?.providerTransactionReference
);

const verifyPaymentRelationships = async (payment) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(payment.paymentPeriod || ''))) {
    return null;
  }

  const [property, tenant, landlord] = await Promise.all([
    Property.findById(payment.property).select('landlord rentedBy availabilityStatus price'),
    User.findById(payment.tenant).select('role'),
    User.findById(payment.landlord).select('role'),
  ]);
  if (
    !property ||
    !tenant ||
    !landlord ||
    tenant.role !== 'tenant' ||
    landlord.role !== 'landlord' ||
    property.availabilityStatus !== 'rented' ||
    String(property.rentedBy) !== String(payment.tenant) ||
    String(property.landlord) !== String(payment.landlord) ||
    Number(property.price).toFixed(2) !== Number(payment.amount).toFixed(2)
  ) {
    return null;
  }

  const rental = payment.rentalRequest
    ? await RentalRequest.findById(payment.rentalRequest)
    : await getConfirmedRental(payment.property, payment.tenant);
  if (
    !rental ||
    String(rental.property) !== String(payment.property) ||
    String(rental.tenant) !== String(payment.tenant) ||
    String(rental.landlord) !== String(payment.landlord) ||
    !['approved', 'confirmed'].includes(rental.status)
  ) {
    return null;
  }

  return rental;
};

const hasCompletePayoutBankDetails = (landlord) => Boolean(
  landlord?.bankAccountName?.trim() &&
  landlord?.bankAccountNumber?.trim() &&
  landlord?.bankCode?.trim()
);


const createOrProcessPayout = async (payment) => {
  if (!isVerifiedPayment(payment)) return null;

  let payout = await Payout.findOne({ payment: payment._id });

  if (payout?.status === 'PAID' || payout?.status === 'FAILED' || payout?.status === 'REVERTED') {
    return payout;
  }

  if (!payout) {
    payout = await Payout.create({
      payment: payment._id,
      tenant: payment.tenant,
      landlord: payment.landlord,
      property: payment.property,
      amount: payment.amount,
      currency: payment.currency,
      paymentReference: payment.paymentReference,
      payoutReference: createPayoutReference(),
      status: 'PENDING',
    });

    console.info(
      '[PAYOUT] created payout=' + payout.payoutReference + ' payment=' + payment.paymentReference
    );
  }

  if (payout.status === 'PROCESSING') {
    const verification = await verifyChapaTransfer(
      payout.providerReference || payout.payoutReference
    );

    payout.status = verification.status;
    payout.providerReference =
      verification.providerReference || payout.providerReference;

    if (
      verification.status === 'FAILED' ||
      verification.status === 'REVERTED'
    ) {
      payout.failureReason = verification.message;
    }

    await payout.save();

    console.info(
      '[PAYOUT] transfer status=' + payout.status + ' reference=' +
      (payout.providerReference || payout.payoutReference)
    );

    return payout;
  }

  const landlord = await User.findById(payment.landlord).select(
    'bankAccountName bankCode +bankAccountNumber'
  );

  if (
    !landlord?.bankAccountName ||
    !landlord.bankAccountNumber ||
    !landlord.bankCode
  ) {
    payout.failureReason = 'Landlord payout bank details are incomplete';
    await payout.save();

    console.warn(
      '[PAYOUT] transfer not requested: incomplete bank details payout=' + payout.payoutReference
    );

    return payout;
  }

  if (!hasTransferConfig()) {
    payout.failureReason = 'Chapa transfer configuration is missing';
    await payout.save();

    console.warn(
      '[PAYOUT] transfer not requested: configuration missing payout=' + payout.payoutReference
    );

    return payout;
  }

  const transfer = await initiateChapaTransfer({
    accountName: landlord.bankAccountName,
    accountNumber: decryptBankAccountNumber(landlord.bankAccountNumber),
    amount: payment.amount,
    bankCode: landlord.bankCode,
    reference: payout.payoutReference,
  });

  console.info(
    '[PAYOUT] transfer requested reference=' +
    (transfer.providerReference || payout.payoutReference) +
    ' status=' + transfer.status
  );

  if (!transfer.ok) {
    payout.status = 'FAILED';
    payout.failureReason = transfer.message;

    await payout.save();

    console.error(
      '[PAYOUT] transfer failure payout=' + payout.payoutReference
    );

    return payout;
  }

  payout.providerReference = transfer.providerReference;
  payout.status = 'PROCESSING';

  await payout.save();

  const verification = await verifyChapaTransfer(
    payout.providerReference
  );

  payout.status = verification.status;
  payout.providerReference =
    verification.providerReference || payout.providerReference;

  if (
    verification.status === 'FAILED' ||
    verification.status === 'REVERTED'
  ) {
    payout.failureReason = verification.message;
  }

  await payout.save();

  console.info(
    '[PAYOUT] transfer status=' + payout.status + ' reference=' +
    (payout.providerReference || payout.payoutReference)
  );

  return payout;
};


const processPayoutSafely = async (payment) => {
  try {
    return await createOrProcessPayout(payment);
  } catch (error) {
    console.error(
      '[PAYOUT] transfer failure payment=' +
      (payment?.paymentReference || 'unknown') + ' reason=' + error.message
    );

    return null;
  }
};


/*
|--------------------------------------------------------------------------
| CREATE PAYMENT
|--------------------------------------------------------------------------
*/

const createPayment = async (req, res) => {
  try {
    const { propertyId, paymentPeriod } = req.body;
    if (!propertyId || !String(paymentPeriod || '').trim()) {
      return res.status(400).json({ message: 'Property and payment period are required' });
    }

    const property = await Property.findById(propertyId);
    if (req.user.role !== 'tenant') return res.status(403).json({ message: 'Only tenants can pay rent' });
    if (!property || property.availabilityStatus !== 'rented' || String(property.rentedBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only pay rent for a property rented in your name' });
    }

    const rental = await getConfirmedRental(propertyId, req.user.id);
    if (!rental || String(rental.landlord) !== String(property.landlord)) {
      return res.status(403).json({ message: 'Payment is only available for your approved or confirmed rented property.' });
    }

    const period = String(paymentPeriod).trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return res.status(400).json({ message: 'Payment period must be in YYYY-MM format' });
    }
    if (!property.landlord || !Number.isFinite(Number(property.price)) || Number(property.price) <= 0) {
      return res.status(409).json({ message: 'Rented property payment details are incomplete' });
    }
    const landlordPayoutDetails = await User.findById(property.landlord)
      .select('bankAccountName bankCode +bankAccountNumber');
    if (!hasCompletePayoutBankDetails(landlordPayoutDetails)) {
      return res.status(409).json({
        message: 'The landlord has not completed bank information. Please contact the landlord before paying rent.',
        code: 'LANDLORD_BANK_INFORMATION_INCOMPLETE',
      });
    }
    const tenant = await User.findById(req.user.id).select('email phone');
    if (!tenant) return res.status(403).json({ message: 'Authenticated tenant not found' });
    const paymentReference = `RP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    let payment = await Payment.findOne({ tenant: req.user.id, property: propertyId, paymentPeriod: period });

    if (payment?.status === 'paid' && !isVerifiedPayment(payment)) {
      payment = await reconcilePayment(payment, req);
    }
    if (payment?.status === 'paid') {
      return res.status(409).json({
        message: isVerifiedPayment(payment)
          ? 'This payment period has already been paid.'
          : 'The previous payment is being reverified. Please check its status before retrying.',
        payment: await paymentView(Payment.findById(payment._id)),
      });
    }
    if (payment?.status === 'pending') {
      if (payment.checkoutUrl) {
        return res.status(200).json({
          message: 'Resume the existing checkout for this payment period.',
          checkoutUrl: payment.checkoutUrl,
          payment: await paymentView(Payment.findById(payment._id)),
        });
      }
      return res.status(409).json({ message: 'A payment is already being initialized for this period. Please try again shortly.' });
    }

    if (!hasChapaConfig()) {
      const config = getProviderConfig();
      return res.status(503).json({
        message: 'PAYMENT PROVIDER CONFIGURATION BLOCKED',
        requiredEnvironmentVariables: ['PAYMENT_PROVIDER', 'CHAPA_SECRET_KEY', 'CHAPA_CALLBACK_URL'],
        configuredProvider: config.provider || null,
      });
    }

    if (payment && ['failed', 'cancelled'].includes(payment.status)) {
      const previousAttempt = {
        paymentReference: payment.paymentReference,
        providerReference: payment.providerReference,
        providerTransactionReference: payment.providerTransactionReference,
        providerPaymentId: payment.providerPaymentId,
        provider: payment.provider,
        amount: payment.amount,
        currency: payment.currency,
        paymentPeriod: payment.paymentPeriod,
        status: payment.status,
        verifiedAt: payment.verifiedAt,
        startedAt: payment.attemptStartedAt || payment.createdAt || new Date(),
        finishedAt: payment.updatedAt || new Date(),
      };
      payment = await Payment.findOneAndUpdate(
        { _id: payment._id, status: { $in: ['failed', 'cancelled'] } },
        {
          $push: { attempts: previousAttempt },
          $set: {
            tenant: req.user.id,
            landlord: property.landlord,
            rentalRequest: rental._id,
            amount: property.price,
            currency: 'ETB',
            paymentPeriod: period,
            status: 'pending',
            paymentReference,
            provider: 'chapa',
            verifiedAt: null,
            attemptStartedAt: new Date(),
          },
          $unset: {
            providerReference: 1,
            providerTransactionReference: 1,
            providerPaymentId: 1,
            checkoutUrl: 1,
          },
        },
        { new: true, runValidators: true }
      );
      if (!payment) {
        const currentPayment = await Payment.findOne({ tenant: req.user.id, property: propertyId, paymentPeriod: period });
        if (currentPayment?.status === 'pending' && currentPayment.checkoutUrl) {
          return res.status(200).json({
            message: 'Resume the existing checkout for this payment period.',
            checkoutUrl: currentPayment.checkoutUrl,
            payment: await paymentView(Payment.findById(currentPayment._id)),
          });
        }
        return res.status(409).json({ message: 'Another payment attempt is already in progress for this period.' });
      }
    } else if (!payment) {
      payment = await Payment.create({
        tenant: req.user.id,
        landlord: property.landlord,
        property: property._id,
        rentalRequest: rental._id,
        amount: property.price,
        currency: 'ETB',
        paymentPeriod: period,
        status: 'pending',
        paymentReference,
        provider: 'chapa',
        attemptStartedAt: new Date(),
      });
    }

    let providerResult;
    try {
      providerResult = await initializeChapaPayment({
        amount: payment.amount,
        currency: payment.currency,
        email: tenant.email,
        phone: tenant.phone,
        paymentReference: payment.paymentReference,
        metadata: {
          paymentId: String(payment._id),
          propertyId: String(property._id),
          landlordId: String(property.landlord),
          propertyTitle: property.title,
        },
      });
    } catch (providerError) {
      console.error('Payment provider request error:', providerError);
      providerResult = { ok: false, providerMessage: 'Payment provider is unavailable' };
    }

    if (!providerResult?.ok) {
      await Payment.updateOne(
        { _id: payment._id, paymentReference, status: 'pending' },
        { $set: { status: 'failed', verifiedAt: null }, $unset: { checkoutUrl: 1 } }
      );
      await createSystemLog({
        user: req.user.id,
        role: req.user.role,
        action: 'PAYMENT_FAILED',
        description: `Tenant payment for property "${property.title}" failed during provider initialization.`,
        property: property._id,
        payment: payment._id,
        status: 'failed',
        ipAddress: req.ip || '',
      });
      return res.status(502).json({ message: providerResult?.providerMessage || 'Payment provider initialization failed', payment: await paymentView(Payment.findById(payment._id)) });
    }

    const initializedPayment = await Payment.findOneAndUpdate(
      { _id: payment._id, paymentReference, status: 'pending' },
      {
        $set: {
          providerReference: providerResult.providerReference,
          providerPaymentId: providerResult.providerPaymentId,
          providerTransactionReference: providerResult.providerTransactionReference,
          checkoutUrl: providerResult.providerCheckoutUrl,
        },
      },
      { new: true, runValidators: true }
    );
    if (!initializedPayment) {
      return res.status(409).json({ message: 'Payment attempt changed while checkout was being initialized. Please reload the payment page.' });
    }

    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: 'PAYMENT_SUBMITTED',
      description: `Tenant submitted a rent payment for property "${property.title}" for period ${period}.`,
      property: property._id,
      payment: payment._id,
      status: 'pending',
      ipAddress: req.ip || '',
    });

    res.status(201).json({
      message: 'Payment initialized. Complete checkout to confirm your rent payment.',
      checkoutUrl: providerResult.providerCheckoutUrl,
      payment: await paymentView(Payment.findById(initializedPayment._id)),
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A payment already exists for this period' });
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const applyChapaVerification = async (payment, verification, req) => {
  if (!payment) return payment;
  if (isVerifiedPayment(payment)) {
    await processPayoutSafely(payment);
    return payment;
  }
  if (payment.status === 'paid') {
    const downgradedPayment = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: 'paid',
        $or: [{ verifiedAt: null }, { verifiedAt: { $exists: false } }],
      },
      {
        $set: { status: 'pending', verifiedAt: null },
        $unset: { checkoutUrl: 1 },
      },
      { new: true }
    );
    if (!downgradedPayment) {
      const currentPayment = await Payment.findById(payment._id);
      if (isVerifiedPayment(currentPayment)) await processPayoutSafely(currentPayment);
      return currentPayment || payment;
    }
    payment = downgradedPayment;
  }
  const verificationResult = validateChapaPaymentVerification(verification, payment);
  if (!verificationResult.ok) {
    console.warn(
      '[PAYMENT] verification rejected reference=' +
      payment.paymentReference + ' reason=' + verificationResult.reason
    );
    return payment;
  }

  const rental = await verifyPaymentRelationships(payment);
  if (!rental) {
    console.warn(
      '[PAYMENT] relationship verification rejected reference=' +
      payment.paymentReference
    );
    return payment;
  }

  const status = verificationResult.status;
  const update = {
    $set: {
      rentalRequest: rental._id,
      providerReference: verification.providerReference,
      providerTransactionReference: verification.providerTransactionReference,
      status: verification.providerStatus,
      verifiedAt: verification.providerStatus === 'paid' ? new Date() : null,
    },
  };
  if (verification.providerPaymentId) {
    update.$set.providerPaymentId = verification.providerPaymentId;
  } else {
    update.$unset = { providerPaymentId: 1 };
  }
  const updatedPayment = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      paymentReference: payment.paymentReference,
      status: 'pending',
    },
    update,
    { new: true, runValidators: true }
  );
  if (!updatedPayment) {
    const currentPayment = await Payment.findById(payment._id);
    if (isVerifiedPayment(currentPayment)) await processPayoutSafely(currentPayment);
    return currentPayment || payment;
  }

  if (status === 'paid') {
    const confirmedPayment = await paymentView(Payment.findById(updatedPayment._id));
    const propertyTitle = confirmedPayment.property?.title || 'Rented property';
    await Notification.create([
      { tenant: updatedPayment.tenant, recipientRole: 'tenant', property: updatedPayment.property, propertyTitle, message: 'Your rent payment was confirmed.', type: 'info' },
      { landlord: updatedPayment.landlord, recipientRole: 'landlord', property: updatedPayment.property, propertyTitle, message: 'Payment Received for your property.', type: 'info' },
      { recipientRole: 'admin', property: updatedPayment.property, propertyTitle, message: 'A tenant rent payment was confirmed.', instructions: `Payment reference: ${updatedPayment.paymentReference}.`, type: 'info' },
    ]);
    await createSystemLog({ user: updatedPayment.tenant, role: 'tenant', action: 'PAYMENT_CONFIRMED', description: `Tenant rent payment for property "${propertyTitle}" was confirmed.`, property: updatedPayment.property, payment: updatedPayment._id, status: 'success', ipAddress: req?.ip || req?.socket?.remoteAddress || '' });
    await processPayoutSafely(updatedPayment);
  } else {
    await createSystemLog({ user: updatedPayment.tenant, role: 'tenant', action: 'PAYMENT_FAILED', description: `Tenant rent payment for property "${updatedPayment.property}" ended in ${status} status.`, property: updatedPayment.property, payment: updatedPayment._id, status: 'failed', ipAddress: req?.ip || req?.socket?.remoteAddress || '' });
  }
  return updatedPayment;
};

const reconcilePayment = async (payment, req) => {
  if (!payment) return payment;
  if (isVerifiedPayment(payment)) {
    await processPayoutSafely(payment);
    return payment;
  }
  if (!['pending', 'paid'].includes(payment.status)) return payment;
  const verification = await verifyChapaPayment(payment.paymentReference);
  return applyChapaVerification(payment, verification, req);
};

const finalizeChapaPayment = async (reference, req, res) => {
  const payment = await Payment.findOne({
    $or: [
      { paymentReference: reference },
      { providerReference: reference },
      { providerTransactionReference: reference },
      { providerPaymentId: reference },
    ],
  });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  if (isVerifiedPayment(payment)) {
    await processPayoutSafely(payment);
    return res.json({ message: 'Payment already confirmed', payment: await paymentView(Payment.findById(payment._id)) });
  }
  const reconciledPayment = await reconcilePayment(payment, req);
  if (reconciledPayment.status === 'pending') return res.status(409).json({ message: 'Payment is not authoritatively confirmed', payment: await paymentView(Payment.findById(payment._id)) });
  return res.json({ message: `Payment ${reconciledPayment.status}`, payment: await paymentView(Payment.findById(reconciledPayment._id)) });
};

const chapaCallback = async (req, res) => {
  try {
    const reference = req.query.tx_ref || req.query.trx_ref || req.query.reference || req.body?.tx_ref || req.body?.trx_ref || req.body?.reference;
    if (!reference) return res.status(400).json({ message: 'Provider payment reference is required' });
    return await finalizeChapaPayment(reference, req, res);
  } catch (error) {
    console.error('Chapa callback error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getTenantPaymentContext = async (req, res) => {
  try {
    const property = await Property.findOne({ _id: req.params.propertyId, rentedBy: req.user.id, availabilityStatus: 'rented' }).populate('landlord', 'name email phone');
    if (!property) return res.status(403).json({ message: 'You can only view payments for your rented property' });
    const rental = await getConfirmedRental(property._id, req.user.id);
    if (!rental) return res.status(403).json({ message: 'Payment is only available for your approved or confirmed rented property.' });
    const landlordPayoutDetails = await User.findById(property.landlord._id)
      .select('bankAccountName bankCode +bankAccountNumber');
    const paymentRecords = await Payment.find({ tenant: req.user.id, property: property._id }).sort({ createdAt: -1 });
    for (const payment of paymentRecords) await reconcilePayment(payment, req);
    const populatedPayments = await paymentView(Payment.find({ tenant: req.user.id, property: property._id }).sort({ createdAt: -1 }));
    const payments = populatedPayments.map(paymentResponse);
    const canonicalPayment = payments.reduce((latest, payment) => {
      if (!latest) return payment;
      return new Date(payment.createdAt || 0).getTime() > new Date(latest.createdAt || 0).getTime() ? payment : latest;
    }, null);
    const canonicalPayout = canonicalPayment ? await Payout.findOne({ payment: canonicalPayment._id }).select('status payoutReference providerReference failureReason') : null;
    res.json({
      property,
      landlord: property.landlord,
      landlordBankInformationComplete: hasCompletePayoutBankDetails(landlordPayoutDetails),
      payments,
      currentPayment: canonicalPayment,
      latestPayment: canonicalPayment,
      paymentStatus: canonicalPayment?.status || null,
      payoutStatus: canonicalPayout?.status || null,
      payout: canonicalPayout,
    });
  } catch (error) {
    console.error('Get tenant payment context error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLandlordPayments = async (req, res) => {
  try {
    const paymentRecords = await paymentView(Payment.find({ landlord: req.user.id }).sort({ createdAt: -1 }));
    const payoutRecords = await Payout.find({ landlord: req.user.id }).select('payment paymentReference status payoutReference providerReference failureReason');
    const payoutByPayment = new Map();
    const payoutByPaymentReference = new Map();
    payoutRecords.forEach((payout) => {
      if (payout?.payment) payoutByPayment.set(String(payout.payment), payout);
      if (payout?.paymentReference) payoutByPaymentReference.set(String(payout.paymentReference), payout);
    });
    const payments = paymentRecords.map((paymentRecord) => {
      const payment = paymentResponse(paymentRecord);
      const payout = payoutByPayment.get(String(payment._id)) || payoutByPaymentReference.get(String(payment.paymentReference)) || null;
      const payoutStatus = payout?.status || null;
      payment.payoutStatus = payoutStatus;
      payment.transferStatus = payoutStatus;
      payment.payoutStatusValue = payoutStatus;
      payment.transferStatusValue = payoutStatus;
      payment.payout = payout ? { status: payoutStatus, payoutReference: payout.payoutReference || null, providerReference: payout.providerReference || null, failureReason: payout.failureReason || null } : null;
      payment.transfer = payout ? { status: payoutStatus, providerReference: payout.providerReference || payout.payoutReference || null, payoutReference: payout.payoutReference || null } : null;
      payment.payoutReference = payout?.payoutReference || null;
      payment.transferReference = payout?.providerReference || payout?.payoutReference || null;
      payment.paymentProvider = payment.provider || null;
      payment.chapaTransactionReference = payment.providerTransactionReference || null;
      return payment;
    });
    res.json(payments);
  } catch (error) {
    console.error('Get landlord payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createPayment, getTenantPaymentContext, getLandlordPayments, chapaCallback, getChapaBanks };
