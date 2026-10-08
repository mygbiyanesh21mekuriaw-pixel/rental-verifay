import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import './rentPayment.css';

const formatStatus = (status) => {
  const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'N/A';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1).toLowerCase();
};

const LandlordPayments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('propertyId');

  useEffect(() => {
    const loadPayments = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/payments/landlord`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const landlordPayments = Array.isArray(response.data) ? response.data : [];
        setPayments(propertyId
          ? landlordPayments.filter((payment) =>String(payment.property?._id || payment.property) === propertyId)
          : landlordPayments);
      } catch (error) {
        setPayments([]);
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
  }, [propertyId]);

  return (
    <div className="payment-page">
      <div className="payment-page-header">
        <div><p className="payment-eyebrow">Landlord finance</p><h1>Rent Payments</h1><p>{propertyId ? 'Payments for this rented property.' : 'Payments received for your properties.'}</p></div>
      </div>
      <p className="payment-muted">
        Verified live payments are credited and submitted to your registered bank through Chapa. Sandbox requests use Chapa's test simulation and never move real bank funds. A transfer is marked EXECUTED only after Chapa confirms a live transfer.
      </p>
      <section className="payment-card payment-table-card">
        {loading ? <p className="payment-muted">Loading payments...</p> : payments.length === 0 ? <p className="payment-muted">No rent payments have been submitted yet.</p> : (
          <div className="payment-table-wrap">
            <table className="payment-table">
              <thead><tr><th>Tenant</th><th>Property</th><th>Amount</th><th>Period</th><th>Date</th><th>Payment Status</th><th>Provider</th><th>Chapa Transaction Reference</th><th>Verified</th><th>Landlord Credit</th><th>External Bank Transfer</th></tr></thead>
              <tbody>{payments.map(payment => {
            const verified = payment.isVerified === true && Boolean(payment.verifiedAt);
            const landlordCreditStatus = payment.landlordCreditStatus || (verified ? 'PENDING' : 'N/A');
            const externalTransferStatus = (payment.externalTransferStatus || 'NOT_EXECUTED')
              .replace(/_/g, ' ')
              .toUpperCase();
            const externalTransferClass = {
              EXECUTED: 'paid',
              'NOT EXECUTED': 'na',
            }[externalTransferStatus] || externalTransferStatus.toLowerCase();
              const paymentStatus = payment.status === 'paid' && !verified
                ? 'Unverified'
                : formatStatus(payment.status);

              return (
                <tr key={payment._id}>
                  <td>{payment.tenant?.name}</td>
                  <td>{payment.property?.title}</td>
                  <td>{payment.currency || 'ETB'} {Number(payment.amount).toLocaleString()}</td>
                  <td>{payment.paymentPeriod}</td>
                  <td>{new Date(payment.createdAt).toLocaleDateString()}</td>
                  <td><span className={`payment-status payment-status-${paymentStatus.toLowerCase()}`}>{paymentStatus}</span></td>
                  <td>{payment.provider || 'N/A'}</td>
                  <td>{payment.chapaTransactionReference || 'Not verified'}</td>
                  <td>
                    <span className={`payment-status ${verified ? 'payment-status-verified' : 'payment-status-unverified'}`}>
                      {verified ? `Yes · ${new Date(payment.verifiedAt).toLocaleDateString()}` : 'No'}
                    </span>
                  </td>
                  <td>
                    <span className={`payment-status payment-status-credit-${String(landlordCreditStatus).toLowerCase()}`}>
                      {landlordCreditStatus}
                    </span>
                    {payment.landlordCredit?.reason && landlordCreditStatus !== 'CREDITED' && (
                      <small className="payment-credit-reason">{payment.landlordCredit.reason}</small>
                    )}
                  </td>
                  <td>
                    <span className={`payment-status payment-status-payout-${externalTransferClass}`}>{externalTransferStatus}</span>
                    {externalTransferStatus === 'EXECUTED' && payment.payout?.payoutReference && (
                      <small className="payment-credit-reason">
                        Payout reference: {payment.payout.payoutReference}
                      </small>
                    )}
                    {externalTransferStatus === 'EXECUTED' && payment.payout?.providerReference && (
                      <small className="payment-credit-reason">
                        Chapa transfer reference: {payment.payout.providerReference}
                      </small>
                    )}
                    {payment.payout?.mode === 'sandbox' && payment.payout?.sandboxTransferStatus && (
                      <small className="payment-credit-reason">
                        Sandbox simulation: {payment.payout.sandboxTransferStatus.toLowerCase()}; no real bank transfer occurred.
                      </small>
                    )}
                    {(payment.payout?.failureReason || payment.payoutFailureReason) && (
                      <small className="payment-credit-reason">
                        {payment.payout?.failureReason || payment.payoutFailureReason}
                      </small>
                    )}
                    {payment.payout?.providerRequestResponse && (
                      <small className="payment-credit-reason">
                        Chapa submission: {payment.payout.providerRequestResponse.apiStatus || 'unknown'}
                        {payment.payout.providerRequestResponse.httpStatus
                          ? ` (HTTP ${payment.payout.providerRequestResponse.httpStatus})`
                          : ''}
                        {payment.payout.providerRequestResponse.message
                          ? ` — ${payment.payout.providerRequestResponse.message}`
                          : ''}
                      </small>
                    )}
                    {payment.payout?.providerVerificationResponse && (
                      <small className="payment-credit-reason">
                        Chapa verification: {payment.payout.providerVerificationResponse.status || 'unknown'}
                        {payment.payout.providerVerificationResponse.httpStatus
                          ? ` (HTTP ${payment.payout.providerVerificationResponse.httpStatus})`
                          : ''}
                        {payment.payout.providerVerificationResponse.message
                          ? ` — ${payment.payout.providerVerificationResponse.message}`
                          : ''}
                      </small>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default LandlordPayments;
