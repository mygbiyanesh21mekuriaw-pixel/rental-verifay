const crypto = require('crypto');
const Payment = require('../models/Payment');
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
      return res.status(403).json({ message: 'Confirmed rental not found' });
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

const finalizeChapaPayment = async (reference, res) => {
  const payment = await Payment.findOne({ $or: [{ paymentReference: reference }, { providerReference: reference }, { providerPaymentId: reference }] });
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  if (payment.status === 'paid') return res.json({ message: 'Payment already confirmed', payment: await paymentView(Payment.findById(payment._id)) });

  const verification = await verifyChapaPayment(payment.providerReference || reference);
  const status = verification?.ok ? verification.providerStatus : 'pending';
  const amountMatches = verification?.amount == null || Number(verification.amount) === Number(payment.amount);
  const currencyMatches = verification?.currency == null || String(verification.currency).toUpperCase() === payment.currency;
  const referenceMatches = !verification?.providerReference || [verification.providerReference, verification.providerPaymentId]
    .filter(Boolean)
    .some(providerReference => [payment.paymentReference, payment.providerReference, payment.providerPaymentId].includes(providerReference));
  if (!verification?.ok || !amountMatches || !currencyMatches || !referenceMatches || !['paid', 'failed', 'cancelled'].includes(status)) {
    return res.status(409).json({ message: 'Payment is not authoritatively confirmed', payment: await paymentView(Payment.findById(payment._id)) });
  }
  payment.status = status;
  payment.providerReference = verification.providerReference || payment.providerReference;
  payment.providerPaymentId = verification.providerPaymentId || payment.providerPaymentId;
  await payment.save();

  if (status === 'paid') {
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
      ipAddress: req?.ip || '',
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
      ipAddress: req?.ip || '',
    });
  }
  return res.json({ message: `Payment ${status}`, payment: await paymentView(Payment.findById(payment._id)) });
};

const chapaCallback = async (req, res) => {
  try {
    const reference = req.query.tx_ref || req.query.trx_ref || req.query.reference || req.body?.tx_ref || req.body?.trx_ref || req.body?.reference;
    if (!reference) return res.status(400).json({ message: 'Provider payment reference is required' });
    const result = await finalizeChapaPayment(reference, res);
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
    if (!rental) return res.status(403).json({ message: 'Confirmed rental not found' });

    const payments = await paymentView(Payment.find({ tenant: req.user.id, property: property._id }).sort({ createdAt: -1 }));
    res.json({ property, landlord: property.landlord, payments });
  } catch (error) {
    console.error('Get tenant payment context error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLandlordPayments = async (req, res) => {
  try {
    const payments = await paymentView(Payment.find({ landlord: req.user.id }).sort({ createdAt: -1 }));
    res.json(payments);
  } catch (error) {
    console.error('Get landlord payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createPayment, getTenantPaymentContext, getLandlordPayments, chapaCallback };
