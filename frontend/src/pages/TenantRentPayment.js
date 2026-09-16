import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BackToDashboard from '../components/BackToDashboard';
import './rentPayment.css';

const formatStatus = (status) => {
  const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'pending';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};
const PAYMENT_REQUEST_TIMEOUT_MS = 20000;
const PAYMENT_RETURN_KEY = 'rentalVerifyPaymentReturn';
const PAYMENT_SUCCESS_DELAY_SECONDS = 3;

const getDefaultPaymentPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const readablePaymentMessage = (value, fallback) => {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    const messages = value.map(item => readablePaymentMessage(item, '')).filter(Boolean);
    if (messages.length > 0) return messages.join(', ');
  }
  if (value && typeof value === 'object') {
    const customizationDescription = value['customization.description'];
    if (typeof customizationDescription === 'string' && customizationDescription.trim()) {
      return customizationDescription;
    }
    const nestedDescription = value.customization?.description;
    if (typeof nestedDescription === 'string' && nestedDescription.trim()) {
      return nestedDescription;
    }
    const message = value.message || value.error || value.detail;
    if (message && message !== value) return readablePaymentMessage(message, fallback);
  }
  return fallback;
};

const TenantRentPayment = () => {
  const { propertyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [context, setContext] = useState(null);
  const [paymentPeriod, setPaymentPeriod] = useState(getDefaultPaymentPeriod);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentReturnState, setPaymentReturnState] = useState(null);
  const [returnCountdown, setReturnCountdown] = useState(PAYMENT_SUCCESS_DELAY_SECONDS);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer;
    let returnTimer;
    let returnPollTimer;

    const storedReturn = localStorage.getItem(PAYMENT_RETURN_KEY);
    let paymentReturn = null;
    try {
      paymentReturn = storedReturn ? JSON.parse(storedReturn) : null;
    } catch (parseError) {
      localStorage.removeItem(PAYMENT_RETURN_KEY);
    }

    const isCurrentPaymentReturn = paymentReturn?.propertyId === propertyId;
    if (!isCurrentPaymentReturn) setPaymentReturnState(null);

    const loadContext = async (showLoading = false) => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`http://localhost:5000/api/payments/tenant/property/${propertyId}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: PAYMENT_REQUEST_TIMEOUT_MS,
        });
        if (cancelled) return null;
        const payload = {
          ...response.data,
          payments: Array.isArray(response.data.payments) ? response.data.payments : [],
          currentPayment: response.data.currentPayment || response.data.latestPayment || response.data.payments?.[0] || null,
        };
        setContext(payload);
        return payload;
      } catch (requestError) {
        if (cancelled) return null;
        setError(readablePaymentMessage(
          requestError.response?.data?.message,
          'Unable to load rent payment details.'
        ));
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    };

    const handleFocusRefresh = () => {
      loadContext();
    };

    const finishPaymentReturn = (status) => {
      if (cancelled) return;
      setPaymentReturnState(status);
      if (status === 'success') {
        setReturnCountdown(PAYMENT_SUCCESS_DELAY_SECONDS);
        let remaining = PAYMENT_SUCCESS_DELAY_SECONDS;
        returnTimer = window.setInterval(() => {
          remaining -= 1;
          setReturnCountdown(remaining);
          if (remaining <= 0) {
            window.clearInterval(returnTimer);
            localStorage.removeItem(PAYMENT_RETURN_KEY);
            navigate(`/tenant/rent-payment/${propertyId}?payment=confirmed`, { replace: true });
          }
        }, 1000);
      } else {
        localStorage.removeItem(PAYMENT_RETURN_KEY);
      }
    };

    const findReturnedPayment = (payload) => {
      if (!paymentReturn?.paymentReference) return null;
      return payload?.payments?.find((payment) => [
        payment.paymentReference,
        payment.providerReference,
        payment.providerPaymentId,
      ].filter(Boolean).includes(paymentReturn.paymentReference)) || null;
    };

    const pollReturnedPayment = async (attempt = 0) => {
      if (!isCurrentPaymentReturn || cancelled) return;
      const refreshedContext = await loadContext();
      const returnedPayment = findReturnedPayment(refreshedContext);
      if (returnedPayment?.status === 'paid') {
        finishPaymentReturn('success');
        return;
      }
      if (returnedPayment?.status === 'failed' || returnedPayment?.status === 'cancelled') {
        setError(`Payment ${returnedPayment.status}.`);
        finishPaymentReturn('failure');
        return;
      }
      if (attempt >= 14) {
        setError('Payment is still being confirmed. Please check the payment status again shortly.');
        finishPaymentReturn('failure');
        return;
      }
      returnPollTimer = window.setTimeout(() => pollReturnedPayment(attempt + 1), 1000);
    };

    loadContext(true).then((initialContext) => {
      if (isCurrentPaymentReturn) {
        pollReturnedPayment();
      }
      const pendingPayment = initialContext?.payments?.some(payment => payment.status === 'pending');
      if (cancelled || !pendingPayment) return;

      let attempts = 0;
      refreshTimer = window.setInterval(async () => {
        attempts += 1;
        const refreshedContext = await loadContext();
        const hasPendingPayment = refreshedContext?.payments?.some(payment => payment.status === 'pending');
        if (attempts >= 6 || !hasPendingPayment) {
          window.clearInterval(refreshTimer);
        }
      }, 2000);
    });

    window.addEventListener('focus', handleFocusRefresh);

    return () => {
      cancelled = true;
      if (refreshTimer) window.clearInterval(refreshTimer);
      if (returnTimer) window.clearInterval(returnTimer);
      if (returnPollTimer) window.clearTimeout(returnPollTimer);
      window.removeEventListener('focus', handleFocusRefresh);
    };
  }, [location.key, navigate, propertyId]);

  const submitPayment = async (event) => {
    event.preventDefault();
    const normalizedPaymentPeriod = (paymentPeriod || '').trim() || getDefaultPaymentPeriod();
    if (!normalizedPaymentPeriod || submitting) return;
    setPaymentPeriod(normalizedPaymentPeriod);
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:5000/api/payments', {
        propertyId,
        paymentPeriod: normalizedPaymentPeriod,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: PAYMENT_REQUEST_TIMEOUT_MS,
      });
      if (response.data.checkoutUrl) {
        localStorage.setItem(PAYMENT_RETURN_KEY, JSON.stringify({
          propertyId,
          paymentReference: response.data.payment?.paymentReference,
        }));
        window.location.assign(response.data.checkoutUrl);
        return;
      }
      setSuccess(readablePaymentMessage(response.data.message, 'Payment submitted successfully.'));
      setContext(current => ({ ...current, payments: [response.data.payment, ...current.payments] }));
      setPaymentPeriod('');
    } catch (requestError) {
      setError(readablePaymentMessage(
        requestError.response?.data?.message,
        'Unable to submit rent payment.'
      ));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="payment-page-state">Loading rent payment details...</div>;
  if (error && !context) return <div className="payment-page payment-page-state"><p className="payment-error">{error}</p><BackToDashboard /></div>;
  if (!context) return <div className="payment-page-state">Loading rent payment details...</div>;

  const latestPayment = context.currentPayment || context.latestPayment || context.payments[0] || null;
  return (
    <div className="payment-page">
      {paymentReturnState === 'success' && (
        <div className="payment-return-success" role="status">
          <strong>Payment Successful</strong>
          <span>Your payment was completed successfully. Returning to your rented property in {returnCountdown} seconds...</span>
        </div>
      )}
      <div className="payment-page-header">
        <div>
          <p className="payment-eyebrow">Tenant payments</p>
          <h1>Pay Rent</h1>
          <p>Submit your rent payment for this rented property.</p>
        </div>
        <BackToDashboard />
      </div>

      <div className="payment-layout">
        <section className="payment-card payment-property-card">
          <span className="payment-property-badge">Rented property</span>
          <h2>{context.property.title}</h2>
          <p className="payment-property-location">📍 {context.property.location}</p>
          <div className="payment-detail-row"><span>Landlord</span><strong>{context.landlord.name}</strong></div>
          <div className="payment-detail-row"><span>Monthly rent</span><strong>ETB {Number(context.property.price).toLocaleString()}</strong></div>
          <div className="payment-detail-row"><span>Payment status</span><strong className={`payment-status payment-status-${latestPayment?.status || 'pending'}`}>{formatStatus(latestPayment?.status || 'pending')}</strong></div>
        </section>

        <section className="payment-card">
          <h2>Submit a payment</h2>
          <p className="payment-muted">Complete the secure provider checkout to confirm this payment.</p>
          {error && <p className="payment-error">{error}</p>}
          {success && <p className="payment-success">{success}</p>}
          <form onSubmit={submitPayment} className="payment-form">
            <label htmlFor="payment-period">Payment period</label>
            <input id="payment-period" type="month" value={paymentPeriod} onChange={event => setPaymentPeriod(event.target.value)} required />
            <div className="payment-amount"><span>Amount due</span><strong>ETB {Number(context.property.price).toLocaleString()}</strong></div>
            <button type="submit" disabled={submitting || !paymentPeriod}>{submitting ? 'Submitting...' : 'Pay Rent'}</button>
          </form>
        </section>
      </div>

      {context.payments.length > 0 && (
        <section className="payment-card payment-history">
          <h2>Payment history</h2>
          {context.payments.map(payment => (
            <div className="payment-history-row" key={payment._id}>
              <span>{payment.paymentPeriod}</span><strong>ETB {Number(payment.amount).toLocaleString()}</strong><span className={`payment-status payment-status-${payment.status}`}>{formatStatus(payment.status)}</span><small>{payment.paymentReference}</small>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default TenantRentPayment;
