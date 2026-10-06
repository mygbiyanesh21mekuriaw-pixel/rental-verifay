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
    const messages = value.map(item =>readablePaymentMessage(item, '')).filter(Boolean);
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

const isVerifiedPayment = (payment) => Boolean(
  payment?.isVerified === true &&
  payment.status === 'paid' &&
  payment.verifiedAt &&
  payment.provider === 'chapa' &&
  payment.providerTransactionReference
);

const formatPaymentPeriod = (period) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) return period || 'N/A';
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    .format(new Date(`${period}-01T00:00:00`));
};

const getReceiptDetails = (payment) => ([
  ['Tenant', payment.tenant?.name || 'N/A'],
  ['Landlord', payment.landlord?.name || 'N/A'],
  ['Property', payment.property?.title || 'N/A'],
  ['Payment period', formatPaymentPeriod(payment.paymentPeriod)],
  ['Amount paid', `${payment.currency || 'ETB'} ${Number(payment.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`],
  ['Payment status', 'PAID'],
  ['Payment method', 'Chapa'],
  ['Transaction reference', payment.providerTransactionReference],
  ['Payment date', new Date(payment.verifiedAt).toLocaleString()],
  ['Verification', 'Payment verified'],
]);

const escapePdfText = (value) => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7e]/g, '?')
  .replace(/[\\()]/g, '\\$&');

const createReceiptPdf = (payment) => {
  if (!isVerifiedPayment(payment)) return null;
  const details = getReceiptDetails(payment);
  const textLines = [
    'BT',
    '/F1 18 Tf',
    '1 0 0 1 54 760 Tm',
    '(HOUSE RENTAL MANAGEMENT SYSTEM) Tj',
    '/F1 14 Tf',
    '1 0 0 1 54 724 Tm',
    '(RENT PAYMENT RECEIPT) Tj',
    '/F1 10 Tf',
    ...details.flatMap(([label, value], index) => [
      `1 0 0 1 54 ${680 - index * 34} Tm`,
      `(${escapePdfText(label)}: ${escapePdfText(value)}) Tj`,
    ]),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${textLines.length} >>\nstream\n${textLines}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const crossReferenceOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += `${offsets.slice(1).map(offset =>`${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
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
  const [printingReceiptId, setPrintingReceiptId] = useState(null);

  useEffect(() => {
    const handleAfterPrint = () =>setPrintingReceiptId(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () =>window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const printReceipt = (paymentId) => {
    setPrintingReceiptId(paymentId);
    window.setTimeout(() =>window.print(), 100);
  };

  const downloadReceipt = (payment) => {
    if (!isVerifiedPayment(payment)) return;
    const url = URL.createObjectURL(createReceiptPdf(payment));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rent-receipt-${payment.paymentReference}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() =>URL.revokeObjectURL(url), 1000);
  };

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
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/payments/tenant/property/${propertyId}`, {
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
      if (isVerifiedPayment(returnedPayment)) {
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
      returnPollTimer = window.setTimeout(() =>pollReturnedPayment(attempt + 1), 1000);
    };

    loadContext(true).then((initialContext) => {
      if (isCurrentPaymentReturn) {
        pollReturnedPayment();
      }
      const pendingPayment = initialContext?.payments?.some(payment =>payment.status === 'pending');
      if (cancelled || !pendingPayment) return;

      let attempts = 0;
      refreshTimer = window.setInterval(async () => {
        attempts += 1;
        const refreshedContext = await loadContext();
        const hasPendingPayment = refreshedContext?.payments?.some(payment =>payment.status === 'pending');
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
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/payments`, {
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
  const previousPage = location.state?.from || '/tenant/rented-property';
  const backButton = <BackToDashboard dashboardRoute={previousPage} label=" Back to Previous Page" />;

  if (error && !context) return <div className="payment-page payment-page-state"><p className="payment-error">{error}</p>{backButton}</div>;
  if (!context) return <div className="payment-page-state">Loading rent payment details...</div>;

  const latestPayment = context.currentPayment || context.latestPayment || context.payments[0] || null;
  const verifiedPayments = context.payments.filter(isVerifiedPayment);
  const visibleStatus = latestPayment?.status === 'paid' && !isVerifiedPayment(latestPayment)
    ? 'pending'
    : latestPayment?.status || 'pending';
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
        {backButton}
      </div>

      <div className="payment-layout">
        <section className="payment-card payment-property-card">
          <span className="payment-property-badge">Rented property</span>
          <h2>{context.property.title}</h2>
          <p className="payment-property-location"> {context.property.location}</p>
          <div className="payment-detail-row"><span>Landlord</span><strong>{context.landlord.name}</strong></div>
          <div className="payment-detail-row"><span>Monthly rent</span><strong>ETB {Number(context.property.price).toLocaleString()}</strong></div>
          <div className="payment-detail-row"><span>Payment status</span><strong className={`payment-status payment-status-${visibleStatus}`}>{formatStatus(visibleStatus)}</strong></div>
        </section>

        <section className="payment-card">
          <h2>Submit a payment</h2>
          <p className="payment-muted">Complete the secure provider checkout to confirm this payment.</p>
          {!context.landlordBankInformationComplete && (
            <p className="payment-error" role="alert">
              {context.landlordBankInformationMessage || 'The landlord has not completed bank information. Please contact the landlord before paying rent.'}
            </p>
          )}
          {error && <p className="payment-error">{error}</p>}
          {success && <p className="payment-success">{success}</p>}
          <form onSubmit={submitPayment} className="payment-form">
            <label htmlFor="payment-period">Payment period</label>
            <input id="payment-period" type="month" value={paymentPeriod} onChange={event =>setPaymentPeriod(event.target.value)} required />
            <div className="payment-amount"><span>Amount due</span><strong>ETB {Number(context.property.price).toLocaleString()}</strong></div>
            <button type="submit" disabled={submitting || !paymentPeriod || !context.landlordBankInformationComplete}>
              {submitting ? 'Submitting...' : 'Pay Rent'}
            </button>
          </form>
        </section>
      </div>

      {verifiedPayments.map(payment => (
        <section
          className="payment-card payment-receipt"
          data-printing={printingReceiptId === payment._id ? 'true' : undefined}
          key={`receipt-${payment._id}`}
          aria-label={`Verified rent receipt for ${formatPaymentPeriod(payment.paymentPeriod)}`}
        >
          <div className="payment-receipt-heading">
            <div>
              <p className="payment-eyebrow">Verified payment</p>
              <h2>Rent Payment Receipt</h2>
              <p className="payment-muted">House Rental Management System</p>
            </div>
            <span className="payment-status payment-status-paid">Verified</span>
          </div>
          <dl className="payment-receipt-details">
            {getReceiptDetails(payment).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="payment-receipt-actions">
            <button type="button" onClick={() =>printReceipt(payment._id)}>Print Receipt</button>
            <button type="button" onClick={() =>downloadReceipt(payment)}>Download PDF</button>
          </div>
        </section>
      ))}

      {context.payments.length > 0 && (
        <section className="payment-card payment-history">
          <h2>Payment history</h2>
          {context.payments.map(payment => {
            const visiblePaymentStatus = payment.status === 'paid' && !isVerifiedPayment(payment)
              ? 'pending'
              : payment.status;
            return (
              <React.Fragment key={payment._id}>
                {payment.attempts?.map(attempt => (
                  <div className="payment-history-row payment-history-attempt" key={attempt.paymentReference}>
                    <span>{formatPaymentPeriod(attempt.paymentPeriod || payment.paymentPeriod)} · Previous attempt</span>
                    <strong>{attempt.currency || payment.currency || 'ETB'} {Number(attempt.amount ?? payment.amount).toLocaleString()}</strong>
                    <span className={`payment-status payment-status-${attempt.status || 'pending'}`}>{formatStatus(attempt.status)}</span>
                    <small>{attempt.paymentReference}</small>
                  </div>
                ))}
                <div className="payment-history-row">
                  <span>{formatPaymentPeriod(payment.paymentPeriod)}</span>
                  <strong>{payment.currency || 'ETB'} {Number(payment.amount).toLocaleString()}</strong>
                  <span className={`payment-status payment-status-${visiblePaymentStatus}`}>{formatStatus(visiblePaymentStatus)}</span>
                  <small>{payment.paymentReference}</small>
                </div>
              </React.Fragment>
            );
          })}
        </section>
      )}
    </div>
  );
};

export default TenantRentPayment;
export { createReceiptPdf, isVerifiedPayment };
