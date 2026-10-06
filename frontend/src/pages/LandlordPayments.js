import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import './rentPayment.css';

const formatStatus = (status) => {
  const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'N/A';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1).toLowerCase();
};

const formatPayoutStatus = (status) => {
  const normalized = typeof status === 'string' ? status.trim() : '';
  if (!normalized) return 'N/A';
  return normalized.toUpperCase();
};

const getRealStatusValue = (payment, nestedKey, directKey) => {
  const directValue = payment?.[directKey];
  if (typeof directValue === 'string' && directValue.trim()) return directValue.trim();

  const nestedValue = payment?.[nestedKey]?.status;
  if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue.trim();

  return '';
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
      <section className="payment-card payment-table-card">
        {loading ? <p className="payment-muted">Loading payments...</p> : payments.length === 0 ? <p className="payment-muted">No rent payments have been submitted yet.</p> : (
          <div className="payment-table-wrap">
            <table className="payment-table">
              <thead><tr><th>Tenant</th><th>Property</th><th>Amount</th><th>Period</th><th>Date</th><th>Payment Status</th><th>Provider</th><th>Chapa Transaction Reference</th><th>Verified</th><th>Demo Account Credit</th><th>Payout Status</th></tr></thead>
              <tbody>{payments.map(payment => {
              const payoutStatus = getRealStatusValue(payment, 'payout', 'payoutStatus') ||
                (payment.isVerified ? 'PENDING' : '');
              const verified = payment.isVerified === true && Boolean(payment.verifiedAt);
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
                    {payment.demoBankCredit?.status === 'credited'
                      ? `${payment.demoBankCredit.accountNumber} · ${Number(payment.demoBankCredit.amount).toLocaleString()} ETB`
                      : 'Not credited'}
                  </td>
                  <td><span className={`payment-status payment-status-payout-${String(payoutStatus || 'na').toLowerCase()}`}>{formatPayoutStatus(payoutStatus)}</span></td>
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
