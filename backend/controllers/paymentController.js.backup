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
} = require('../utils/paymentProvider');
const {
  hasTransferConfig,
  initiateChapaTransfer,
  verifyChapaTransfer,
  listChapaBanks,
  createPayoutReference,
} = require('../utils/payoutProvider');

const getChapaBanks = async (req, res) => {
  try {
    if (req.user.role !== 'landlord') return res.status(403).json({ message: 'Landlords only' });
    const result = await listChapaBanks();
    if (!result.ok) return res.status(503).json({ message: result.message || 'Unable to load supported banks' });
    res.json(result.banks);
  } catch (error) {
    console.error('Get Chapa banks error:', error.message);
    res.status(502).json({ message: 'Unable to load supported banks' });
  }
};

const paymentView = (query) => query
  .populate('tenant', 'name email phone')
  .populate('landlord', 'name email phone')
  .populate('property', 'title location price');

const getConfirmedRental = async (propertyId, tenantId) => {
  const request = await RentalRequest.findOne({
    property: propertyId,
    tenant: tenantId,
    status: { $in: ['approved', 'confirmed'] },
  });
  return request;
};

const createOrProcessPayout = async (payment) => {
  if (!payment || payment.status !== 'paid') return null;
  let payout = await Payout.findOne({ payment: payment._id });
  if (payout?.status === 'PAID') {
    console.info(`[PAYOUT] duplicate prevented payment=${payment.paymentReference}`);
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
    console.info(`[PAYOUT] created payout=${payout.payoutReference} payment=${payment.paymentReference}`);
  }

  if (payout.status === 'PROCESSING') {
    const verification = await verifyChapaTransfer(payout.providerReference || payout.payoutReference);
    payout.status = verification.status;
    payout.providerReference = verification.providerReference || payout.providerReference;
    if (verification.status === 'FAILED' || verification.status === 'REVERTED') payout.failureReason = verification.message;
    await payout.save();
    console.info(`[PAYOUT] transfer status=${payout.status} reference=${payout.providerReference || payout.payoutReference}`);
    return payout;
  }

  const landlord = await User.findById(payment.landlord).select('bankAccountName bankAccountNumber bankCode');
  if (!landlord?.bankAccountName || !landlord.bankAccountNumber || !landlord.bankCode) {
    payout.failureReason = 'Landlord payout bank details are incomplete';
    await payout.save();
    console.warn(`[PAYOUT] transfer not requested: incomplete bank details payout=${payout.payoutReference}`);
    return payout;
  }
  if (!hasTransferConfig()) {
    payout.failureReason = 'Chapa transfer configuration is missing';
    await payout.save();
    console.warn(`[PAYOUT] transfer not requested: configuration missing payout=${payout.payoutReference}`);
    return payout;
  }

  const transfer = await initiateChapaTransfer({
    accountName: landlord.bankAccountName,
    accountNumber: landlord.bankAccountNumber,
    amount: payment.amount,
    bankCode: landlord.bankCode,
    reference: payout.payoutReference,
  });
  console.info(`[PAYOUT] transfer requested reference=${transfer.providerReference || payout.payoutReference} status=${transfer.status}`);
  if (!transfer.ok) {
    payout.status = 'FAILED';
    payout.failureReason = transfer.message;
    await payout.save();
    console.error(`[PAYOUT] transfer failure payout=${payout.payoutReference}`);
    return payout;
  }

  payout.providerReference = transfer.providerReference;
  payout.status = 'PROCESSING';
  await payout.save();
  const verification = await verifyChapaTransfer(payout.providerReference);
  payout.status = verification.status;
  payout.providerReference = verification.providerReference || payout.providerReference;
  if (verification.status === 'FAILED' || verification.status === 'REVERTED') payout.failureReason = verification.message;
  await payout.save();
  console.info(`[PAYOUT] transfer status=${payout.status} reference=${payout.providerReference || payout.payoutReference}`);
  return payout;
};

const processPayoutSafely = async (payment) => {
  try {
    return await createOrProcessPayout(payment);
  } catch (error) {
    console.error(`[PAYOUT] transfer failure payment=${payment?.paymentReference || 'unknown'} reason=${error.message}`);
    return null;
  }
};

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
    const tenant = await User.findById(req.user.id).select('email phone');
    if (!tenant) return res.status(403).json({ message: 'Authenticated tenant not found' });
    const existing = await Payment.findOne({ tenant: req.user.id, property: propertyId, paymentPeriod: period });
    if (existing) return res.status(409).json({ message: 'A payment already exists for this period', payment: existing });

    if (!hasChapaConfig()) {
      const config = getProviderConfig();
      return res.status(503).json({
        message: 'PAYMENT PROVIDER CONFIGURATION BLOCKED',
        requiredEnvironmentVariables: ['PAYMENT_PROVIDER', 'CHAPA_SECRET_KEY', 'CHAPA_CALLBACK_URL'],
        configuredProvider: config.provider || null,
      });
    }

    const payment = await Payment.create({
      tenant: req.user.id,
      landlord: property.landlord,
      property: property._id,
      amount: property.price,
      currency: 'ETB',
      paymentPeriod: period,
      status: 'pending',
      paymentReference: `RP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      provider: 'chapa',
    });

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
      payment.status = 'failed';
      await payment.save();
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

    payment.providerReference = providerResult.providerReference;
    payment.providerPaymentId = providerResult.providerPaymentId;
    payment.checkoutUrl = providerResult.providerCheckoutUrl;
    await payment.save();

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
      payment: await paymentView(Payment.findById(payment._id)),
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A payment already exists for this period' });
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const applyChapaVerification = async (payment, verification, req) => {
  if (!payment) return payment;
  if (payment.status === 'paid') {
    await processPayoutSafely(payment);
    return payment;
  }
  const status = verification?.ok ? verification.providerStatus : 'pending';
  const amountMatches = verification?.amount == null || Number(verification.amount) === Number(payment.amount);
  const currencyMatches = verification?.currency == null || String(verification.currency).toUpperCase() === payment.currency;
  const referenceMatches = !verification?.providerReference || [verification.providerReference, verification.providerPaymentId]
    .filter(Boolean)
    .some(providerReference => [payment.paymentReference, payment.providerReference, payment.providerPaymentId].includes(providerReference));
  if (!verification?.ok || !amountMatches || !currencyMatches || !referenceMatches || !['paid', 'failed', 'cancelled'].includes(status)) {
    return payment;
  }

  const previousStatus = payment.status;
  payment.status = status;
  payment.providerReference = verification.providerReference || payment.providerReference;
  payment.providerPaymentId = verification.providerPaymentId || payment.providerPaymentId;
  await payment.save();

  if (status === 'paid' && previousStatus !== 'paid') {
    const confirmedPayment = await paymentView(Payment.findById(payment._id));
    const propertyTitle = confirmedPayment.property?.title || 'Rented property';
    await Notification.create([
      { tenant: payment.tenant, recipientRole: 'tenant', property: payment.property, propertyTitle, message: 'Your rent payment was confirmed.', type: 'info' },
      { landlord: payment.landlord, recipientRole: 'landlord', property: payment.property, propertyTitle, message: 'Payment Received for your property.', type: 'info' },
    ]);
    await createSystemLog({
      user: payment.tenant,
      role: 'tenant',
      action: 'PAYMENT_CONFIRMED',
      description: `Tenant rent payment for property "${propertyTitle}" was confirmed.`,
      property: payment.property,
      payment: payment._id,
      status: 'success',
      ipAddress: req?.ip || req?.socket?.remoteAddress || '',
    });
  } else if (status === 'failed' || status === 'cancelled') {
    await createSystemLog({
      user: payment.tenant,
      role: 'tenant',
      action: 'PAYMENT_FAILED',
      description: `Tenant rent payment for property "${payment.property}" ended in ${status} status.`,
      property: payment.property,
      payment: payment._id,
      status: 'failed',
      ipAddress: req?.ip || req?.socket?.remoteAddress || '',
    });
  }
  if (status === 'paid') await processPayoutSafely(payment);
  return payment;
};

const reconcilePayment = async (payment, req) => {
  if (!payment) return payment;
  if (payment.status === 'paid') {
    await processPayoutSafely(payment);
    return payment;
  }
  if (payment.status !== 'pending') return payment;
  const verification = await verifyChapaPayment(payment.providerReference || payment.paymentReference);
  return applyChapaVerification(payment, verification, req);
};

const finalizeChapaPayment = async (reference, req, res) => {
  const payment = await Payment.findOne({ $or: [{ paymentReference: reference }, { providerReference: reference }, { providerPaymentId: reference }] });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  if (payment.status === 'paid') {
    await processPayoutSafely(payment);
    return res.json({ message: 'Payment already confirmed', payment: await paymentView(Payment.findById(payment._id)) });
  }

  const reconciledPayment = await reconcilePayment(payment, req);
  if (reconciledPayment.status === 'pending') {
    return res.status(409).json({ message: 'Payment is not authoritatively confirmed', payment: await paymentView(Payment.findById(payment._id)) });
  }

  return res.json({ message: `Payment ${reconciledPayment.status}`, payment: await paymentView(Payment.findById(reconciledPayment._id)) });
};

const chapaCallback = async (req, res) => {
  try {
    const reference = req.query.tx_ref || req.query.trx_ref || req.query.reference || req.body?.tx_ref || req.body?.trx_ref || req.body?.reference;
    if (!reference) return res.status(400).json({ message: 'Provider payment reference is required' });
    const result = await finalizeChapaPayment(reference, req, res);
    return result;
  } catch (error) {
    console.error('Chapa callback error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getTenantPaymentContext = async (req, res) => {
  try {
    const property = await Property.findOne({ _id: req.params.propertyId, rentedBy: req.user.id, availabilityStatus: 'rented' })
      .populate('landlord', 'name email phone');
    if (!property) return res.status(403).json({ message: 'You can only view payments for your rented property' });

    const rental = await getConfirmedRental(property._id, req.user.id);
    if (!rental) return res.status(403).json({ message: 'Payment is only available for your approved or confirmed rented property.' });

    const paymentRecords = await Payment.find({ tenant: req.user.id, property: property._id }).sort({ createdAt: -1 });
    for (const payment of paymentRecords) {
      await reconcilePayment(payment, req);
    }
    const payments = await paymentView(Payment.find({ tenant: req.user.id, property: property._id }).sort({ createdAt: -1 }));
    const canonicalPayment = payments.reduce((latest, payment) => {
      if (!latest) return payment;
      const latestDate = new Date(latest.createdAt || 0).getTime();
      const currentDate = new Date(payment.createdAt || 0).getTime();
      return currentDate > latestDate ? payment : latest;
    }, null);
    const canonicalPayout = canonicalPayment
      ? await Payout.findOne({ payment: canonicalPayment._id }).select('status payoutReference providerReference failureReason')
      : null;

    res.json({
      property,
      landlord: property.landlord,
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
      const payment = paymentRecord.toObject();
      const payout = payoutByPayment.get(String(payment._id)) || payoutByPaymentReference.get(String(payment.paymentReference)) || null;
      const payoutStatus = payout?.status || null;
      const transferStatus = payout?.status || null;

      payment.payoutStatus = payoutStatus;
      payment.transferStatus = transferStatus;
      payment.payoutStatusValue = payoutStatus;
      payment.transferStatusValue = transferStatus;
      payment.payout = payout
        ? {
            status: payoutStatus,
            payoutReference: payout.payoutReference || null,
            providerReference: payout.providerReference || null,
            failureReason: payout.failureReason || null,
          }
        : null;
      payment.transfer = payout
        ? {
            status: transferStatus,
            providerReference: payout.providerReference || payout.payoutReference || null,
            payoutReference: payout.payoutReference || null,
          }
        : null;
      payment.payoutReference = payout?.payoutReference || null;
      payment.transferReference = payout?.providerReference || payout?.payoutReference || null;
      return payment;
    });
    res.json(payments);
  } catch (error) {
    console.error('Get landlord payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createPayment, getTenantPaymentContext, getLandlordPayments, chapaCallback, getChapaBanks };
