import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import BackToPreviousPage from '../components/BackToPreviousPage';
import './rentPayment.css';

const formatStatus = (status) => {
  const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'N/A';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1).toLowerCase();
};

const formatCurrency = (value) => `ETB ${Number(value || 0).toLocaleString('en-US')}`;

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const shortenReference = (value) => {
  if (!value || value === 'Not verified') return '—';
  const reference = String(value).trim();
  if (reference.length <= 12) return reference;
  return `${reference.slice(0, 8)}…${reference.slice(-4)}`;
};

const LandlordPayments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
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
        const normalizedPayments = propertyId
          ? landlordPayments.filter((payment) => String(payment.property?._id || payment.property) === propertyId)
          : landlordPayments;
        setPayments(normalizedPayments);
      } catch (error) {
        setPayments([]);
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
  }, [propertyId]);

  const propertyOptions = useMemo(() => {
    const titles = payments
      .map((payment) => payment.property?.title)
      .filter(Boolean);
    return [...new Set(titles)];
  }, [payments]);

  const periodOptions = useMemo(() => {
    const periods = payments
      .map((payment) => payment.paymentPeriod)
      .filter(Boolean);
    return [...new Set(periods)];
  }, [payments]);

  const summary = useMemo(() => {
    const paid = payments.filter((payment) => payment.isVerified === true || (payment.status === 'paid' && payment.verifiedAt));
    const pending = payments.filter((payment) => payment.status === 'pending' || (!payment.isVerified && payment.status === 'paid' && !payment.verifiedAt));
    const totalReceived = paid.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const awaitingVerification = payments.filter((payment) => payment.status === 'paid' && !(payment.isVerified === true || payment.verifiedAt)).length;

    return {
      totalReceived,
      pending: pending.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      paidPayments: paid.length,
      awaitingVerification,
    };
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return payments.filter((payment) => {
      const tenantName = payment.tenant?.name || '';
      const propertyName = payment.property?.title || '';
      const reference = payment.chapaTransactionReference || payment.providerTransactionReference || payment.paymentReference || '';
      const status = payment.isVerified === true || (payment.status === 'paid' && payment.verifiedAt)
        ? 'paid'
        : payment.status === 'pending' ? 'pending' : 'unverified';

      const matchesSearch = !query || [tenantName, propertyName, reference].some((value) => String(value).toLowerCase().includes(query));
      const matchesPeriod = periodFilter === 'all' || payment.paymentPeriod === periodFilter;
      const matchesProperty = propertyFilter === 'all' || propertyName === propertyFilter;
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesPeriod && matchesProperty && matchesStatus;
    });
  }, [payments, periodFilter, propertyFilter, searchTerm, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, periodFilter, propertyFilter, statusFilter, propertyId]);

  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const pagedPayments = filteredPayments.slice((page - 1) * pageSize, page * pageSize);

  const handleExportCsv = () => {
    const rows = [
      ['Tenant', 'Property', 'Period', 'Paid on', 'Amount', 'Status', 'Reference'],
      ...filteredPayments.map((payment) => {
        const verified = payment.isVerified === true && Boolean(payment.verifiedAt);
        const status = verified ? 'Paid' : payment.status === 'paid' ? 'Unverified' : formatStatus(payment.status);
        return [
          payment.tenant?.name || '',
          payment.property?.title || '',
          payment.paymentPeriod || '',
          formatDate(payment.verifiedAt || payment.createdAt),
          Number(payment.amount || 0),
          status,
          payment.chapaTransactionReference || payment.providerTransactionReference || payment.paymentReference || '',
        ];
      }),
    ];

    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rent-payments.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="payment-page !m-0 !w-full !max-w-none !p-0 flex flex-col gap-3">
      {propertyId && <BackToPreviousPage />}
      <div className="payment-page-header">
        <div>
          <p className="payment-eyebrow">Landlord finance</p>
          <h1>Rent Payments</h1>
          <p>{propertyId ? 'Payments for this rented property.' : 'Payments received for your properties.'}</p>
        </div>
        <button type="button" className="payment-export-button" onClick={handleExportCsv}>
          Export CSV
        </button>
      </div>

      <div className="payment-summary-grid" aria-label="Rent payment summary">
        <article className="payment-summary-card">
          <span className="payment-summary-label">Total received</span>
          <strong className="payment-summary-value">{loading ? '—' : formatCurrency(summary.totalReceived)}</strong>
          <span className="payment-summary-detail">{propertyId ? 'This property' : 'Across all properties'}</span>
        </article>
        <article className="payment-summary-card">
          <span className="payment-summary-label">Pending</span>
          <strong className="payment-summary-value">{loading ? '—' : formatCurrency(summary.pending)}</strong>
          <span className="payment-summary-detail">Awaiting completion</span>
        </article>
        <article className="payment-summary-card">
          <span className="payment-summary-label">Paid payments</span>
          <strong className="payment-summary-value">{loading ? '—' : summary.paidPayments}</strong>
          <span className="payment-summary-detail">Verified payments</span>
        </article>
        <article className="payment-summary-card">
          <span className="payment-summary-label">Awaiting verification</span>
          <strong className="payment-summary-value">{loading ? '—' : summary.awaitingVerification}</strong>
          <span className="payment-summary-detail">Needs confirmation</span>
        </article>
      </div>

      <section className="payment-card payment-table-card">
        <div className="payment-toolbar">
          <label className="payment-search-field">
            <span className="sr-only">Search tenant, property, reference</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search tenant, property, reference"
            />
          </label>

          <div className="payment-filter-row">
            <label className="payment-filter-field">
              <span>Period</span>
              <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
                <option value="all">All</option>
                {periodOptions.map((period) => (
                  <option key={period} value={period}>{period}</option>
                ))}
              </select>
            </label>

            <label className="payment-filter-field">
              <span>Property</span>
              <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}>
                <option value="all">All</option>
                {propertyOptions.map((property) => (
                  <option key={property} value={property}>{property}</option>
                ))}
              </select>
            </label>

            <label className="payment-filter-field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="unverified">Unverified</option>
              </select>
            </label>
          </div>
        </div>

        {loading ? <p className="payment-muted">Loading payments...</p> : filteredPayments.length === 0 ? <p className="payment-muted">No rent payments have been submitted yet.</p> : (
          <div className="payment-table-wrap">
            <table className="payment-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Property</th>
                  <th>Amount</th>
                  <th>Period</th>
                  <th>Date</th>
                  <th>Payment Status</th>
                  <th>Provider</th>
                  <th>Chapa Transaction Reference</th>
                  <th>Verified</th>
                  <th>Landlord Credit</th>
                </tr>
              </thead>
              <tbody>
                {pagedPayments.map((payment) => {
                  const verified = payment.isVerified === true && Boolean(payment.verifiedAt);
                  const landlordCreditStatus = payment.landlordCreditStatus || (verified ? 'PENDING' : 'N/A');
                  const paymentStatus = payment.status === 'paid' && !verified ? 'Unverified' : formatStatus(payment.status);
                  const displayReference = payment.chapaTransactionReference || payment.providerTransactionReference || 'Not verified';

                  return (
                    <tr key={payment._id}>
                      <td>{payment.tenant?.name}</td>
                      <td>{payment.property?.title}</td>
                      <td>{formatCurrency(Number(payment.amount || 0))}</td>
                      <td>{payment.paymentPeriod}</td>
                      <td>{formatDate(payment.createdAt)}</td>
                      <td><span className={`payment-status payment-status-${paymentStatus.toLowerCase()}`}>{paymentStatus}</span></td>
                      <td>{payment.provider || 'N/A'}</td>
                      <td>{shortenReference(displayReference)}</td>
                      <td>
                        <span className={`payment-status ${verified ? 'payment-status-verified' : 'payment-status-unverified'}`}>
                          {verified ? `Yes · ${formatDate(payment.verifiedAt)}` : 'Not verified'}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredPayments.length > 0 && (
          <div className="payment-pagination-row" aria-label="Payment pagination">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              ◀
            </button>
            <span>{page}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>
              ▶
            </button>
            <span>{filteredPayments.length} / page</span>
          </div>
        )}
      </section>
    </div>
  );
};

export default LandlordPayments;

