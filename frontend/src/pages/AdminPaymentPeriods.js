import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { apiUrl } from '../utils/apiUrl';
import { useLanguage } from '../context/LanguageContext';

const initialFilters = {
  q: '',
  period: '',
  area: '',
  status: '',
  from: '',
  to: '',
};

const formatAreaName = (value) => String(value || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => `${word.charAt(0).toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`)
  .join(' ');

const formatPeriod = (period, language) => {
  if (!/^\d{4}-\d{2}$/.test(String(period || ''))) return period || '—';
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${period}-01T00:00:00.000Z`));
};

const formatAmount = (amount, language) => `ETB ${Number(amount || 0).toLocaleString(language, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const isAdvancePayment = (period, paidOn) => {
  if (!paidOn || !/^\d{4}-\d{2}$/.test(String(period || ''))) return false;
  return period > new Date(paidOn).toISOString().slice(0, 7);
};

const getPaymentArea = (property) => property?.area || property?.city || property?.region
  || property?.subCity || property?.zone || property?.wereda || '';

const PaymentPeriodSummaryCard = ({ label, value, detail }) => (
  <article className="admin-payment-summary-card">
    <span className="admin-payment-summary-label">{label}</span>
    <strong className="admin-payment-summary-value">{value}</strong>
    <span className="admin-payment-summary-detail">{detail}</span>
  </article>
);

const AdminPaymentPeriods = () => {
  const { t, formatDate, language } = useLanguage();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('date:desc');
  const [payments, setPayments] = useState([]);
  const [totals, setTotals] = useState({ totalCollected: 0, totalPayments: 0, paidCount: 0, pendingFailedCount: 0 });
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');

  useEffect(() => {
    let active = true;
    const fetchPayments = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(apiUrl('/api/admin/payment-periods'), {
          params: { ...filters, page, limit, sort },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!active) return;
        const result = response.data || {};
        setPayments(Array.isArray(result.payments) ? result.payments : []);
        setTotals(result.totals || { totalCollected: 0, totalPayments: 0, paidCount: 0, pendingFailedCount: 0 });
        setPageCount(Math.max(1, Number(result.pagination?.pages || 1)));
      } catch (error) {
        if (!active) return;
        setPayments([]);
        setLoadError(error.response?.data?.message || t('Unable to load payment periods.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPayments();
    return () => {
      active = false;
    };
  }, [filters, page, limit, sort, t]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleSort = (field) => {
    const [currentField, direction] = sort.split(':');
    setSort(`${field}:${currentField === field && direction === 'asc' ? 'desc' : 'asc'}`);
    setPage(1);
  };

  const renderPaymentPeriod = (payment) => (
    <span className="admin-payment-period-cell">
      {formatPeriod(payment.paymentPeriod, language)}
      {isAdvancePayment(payment.paymentPeriod, payment.paidOn) && (
        <span className="admin-payment-advance-tag">{t('Advance')}</span>
      )}
    </span>
  );

  const renderStatus = (status) => {
    const normalizedStatus = ['paid', 'pending', 'failed'].includes(status) ? status : 'other';
    const label = ['paid', 'pending', 'failed', 'cancelled'].includes(status) ? status : 'unknown';
    return (
      <span className={`admin-payment-status-badge is-${normalizedStatus}`}>
        {t(label.charAt(0).toUpperCase() + label.slice(1))}
      </span>
    );
  };

  const renderReference = (reference) => {
    const fullReference = reference || '—';
    const shortenedReference = fullReference.length > 18
      ? `${fullReference.slice(0, 8)}…${fullReference.slice(-6)}`
      : fullReference;
    return (
      <span className="admin-payment-reference" title={fullReference}>
        <span>{shortenedReference}</span>
        {reference && (
          <button
            type="button"
            className="admin-payment-copy-button"
            aria-label={t('Copy reference {reference}').replace('{reference}', fullReference)}
            title={t('Copy reference')}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(reference);
                setCopyFeedback(t('Reference copied.'));
              } catch (error) {
                setCopyFeedback(t('Unable to copy reference.'));
              }
            }}
          >
            <span aria-hidden="true">⧉</span>
          </button>
        )}
      </span>
    );
  };

  const fromRow = (page - 1) * limit + 1;
  const toRow = Math.min(page * limit, Number(totals.totalPayments || 0));
  const rangeLabel = loading
    ? t('Loading payment periods...')
    : Number(totals.totalPayments || 0) === 0
      ? t('Showing 0 results')
    : t('Showing {start}–{end} of {count}').replace('{start}', String(fromRow))
      .replace('{end}', String(toRow))
      .replace('{count}', String(totals.totalPayments));

  return (
    <section className="admin-payment-period-content" aria-labelledby="admin-payment-period-title">
      <header className="admin-payment-period-heading">
        <div>
          <h2 id="admin-payment-period-title" className="admin-card-title">{t('Payment Period Overview')}</h2>
          <p>{t('Review payments by period, status, and area.')}</p>
        </div>
        <span className="admin-result-count" aria-live="polite">{rangeLabel}</span>
      </header>
      <span className="admin-payment-copy-live" role="status" aria-live="polite">{copyFeedback}</span>

      <div className="admin-payment-summary-grid" aria-label={t('Payment summary')}>
        <PaymentPeriodSummaryCard
          label={t('Total collected')}
          value={loading ? '—' : formatAmount(totals.totalCollected, language)}
          detail={t('Paid payments only')}
        />
        <PaymentPeriodSummaryCard
          label={t('Total payments')}
          value={loading ? '—' : Number(totals.totalPayments || 0).toLocaleString(language)}
          detail={t('Matching current filters')}
        />
        <PaymentPeriodSummaryCard
          label={t('Paid count')}
          value={loading ? '—' : Number(totals.paidCount || 0).toLocaleString(language)}
          detail={t('Successfully paid')}
        />
        <PaymentPeriodSummaryCard
          label={t('Pending/Failed count')}
          value={loading ? '—' : Number(totals.pendingFailedCount || 0).toLocaleString(language)}
          detail={t('Awaiting or unsuccessful')}
        />
      </div>

      <div className="admin-payment-filter-panel">
        <div className="admin-payment-filter-grid">
          <label className="admin-payment-filter-field admin-payment-search-field">
            <span>{t('Search')}</span>
            <input
              type="search"
              value={filters.q}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder={t('Tenant, property, or reference')}
            />
          </label>
          <label className="admin-payment-filter-field">
            <span>{t('Period')}</span>
            <input type="month" value={filters.period} onChange={(event) => updateFilter('period', event.target.value)} />
          </label>
          <label className="admin-payment-filter-field">
            <span>{t('Area')}</span>
            <input
              type="search"
              value={filters.area}
              onChange={(event) => updateFilter('area', event.target.value)}
              placeholder={t('Filter by area')}
            />
          </label>
          <label className="admin-payment-filter-field">
            <span>{t('Status')}</span>
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              <option value="">{t('All statuses')}</option>
              <option value="paid">{t('Paid')}</option>
              <option value="pending">{t('Pending')}</option>
              <option value="failed">{t('Failed')}</option>
              <option value="cancelled">{t('Cancelled')}</option>
            </select>
          </label>
          <label className="admin-payment-filter-field">
            <span>{t('Paid on or after')}</span>
            <input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
          </label>
          <label className="admin-payment-filter-field">
            <span>{t('Paid on or before')}</span>
            <input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
          </label>
        </div>
        <div className="admin-payment-filter-footer">
          <button
            type="button"
            className="admin-payment-clear-filters"
            onClick={() => {
              setFilters(initialFilters);
              setPage(1);
              setSort('date:desc');
            }}
            disabled={Object.values(filters).every((value) => !value)}
          >
            {t('Clear filters')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-payment-state" role="status">{t('Loading payment periods...')}</div>
      ) : loadError ? (
        <div className="admin-payment-state is-error" role="alert">{loadError}</div>
      ) : payments.length === 0 ? (
        <div className="admin-payment-state">{t('No payment period data found.')}</div>
      ) : (
        <>
          <div className="admin-area-admin-table-wrap admin-payment-table-wrap">
            <table className="admin-area-admin-table admin-payment-table">
              <thead>
                <tr>
                  <th scope="col" aria-sort={sort.startsWith('period:') ? (sort.endsWith('asc') ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="admin-payment-sort-button" onClick={() => toggleSort('period')}>
                      {t('Period')} <span aria-hidden="true">{sort.startsWith('period:') ? (sort.endsWith('asc') ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                  <th scope="col">{t('Tenant')}</th>
                  <th scope="col">{t('Property')}</th>
                  <th scope="col">{t('Area')}</th>
                  <th scope="col" className="is-numeric" aria-sort={sort.startsWith('amount:') ? (sort.endsWith('asc') ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="admin-payment-sort-button" onClick={() => toggleSort('amount')}>
                      {t('Amount')} <span aria-hidden="true">{sort.startsWith('amount:') ? (sort.endsWith('asc') ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                  <th scope="col" aria-sort={sort.startsWith('date:') ? (sort.endsWith('asc') ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="admin-payment-sort-button" onClick={() => toggleSort('date')}>
                      {t('Paid on')} <span aria-hidden="true">{sort.startsWith('date:') ? (sort.endsWith('asc') ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                  <th scope="col">{t('Status')}</th>
                  <th scope="col">{t('Reference')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment._id}>
                    <td data-label={t('Period')}>{renderPaymentPeriod(payment)}</td>
                    <td data-label={t('Tenant')}>{payment.tenant?.name || t('Unknown')}</td>
                    <td data-label={t('Property')}>{payment.property?.title || t('Unknown property')}</td>
                    <td data-label={t('Area')}>{formatAreaName(getPaymentArea(payment.property)) || '—'}</td>
                    <td data-label={t('Amount')} className="admin-payment-amount">{formatAmount(payment.amount, language)}</td>
                    <td data-label={t('Paid on')}>{payment.paidOn ? formatDate(payment.paidOn) : '—'}</td>
                    <td data-label={t('Status')}>{renderStatus(payment.status)}</td>
                    <td data-label={t('Reference')}>{renderReference(payment.paymentReference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-payment-mobile-list">
            {payments.map((payment) => (
              <article className="admin-payment-mobile-card" key={payment._id}>
                <div className="admin-payment-mobile-card-heading">
                  <strong>{formatAmount(payment.amount, language)}</strong>
                  {renderStatus(payment.status)}
                </div>
                <dl>
                  <div><dt>{t('Tenant')}</dt><dd>{payment.tenant?.name || t('Unknown')}</dd></div>
                  <div><dt>{t('Property')}</dt><dd>{payment.property?.title || t('Unknown property')}</dd></div>
                  <div><dt>{t('Period')}</dt><dd>{renderPaymentPeriod(payment)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <footer className="admin-payment-pagination">
            <label>
              <span>{t('Rows per page')}</span>
              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <span>{t('Page {current} of {total}').replace('{current}', String(page)).replace('{total}', String(pageCount))}</span>
            <div>
              <button type="button" className="admin-btn" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                {t('Previous')}
              </button>
              <button type="button" className="admin-btn" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                {t('Next')}
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
};

export default AdminPaymentPeriods;
