import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './LandlordBankInformation.css';

const getTransactionReferences = (transaction) => [
  { label: 'Rent payment', value: transaction.paymentReference },
  { label: 'Chapa payment', value: transaction.providerTransactionReference },
  { label: 'Payout', value: transaction.payoutReference || transaction.providerReference },
  { label: 'Chapa transfer', value: transaction.chapaTransferReference },
].filter((reference) => reference.value);

const shortenReference = (reference) => (
  reference.length > 20 ? `${reference.slice(0, 9)}…${reference.slice(-7)}` : reference
);

const getLedgerStatusClass = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (['credited', 'paid', 'completed', 'active'].includes(normalizedStatus)) return 'credited';
  if (['pending', 'processing'].includes(normalizedStatus)) return 'pending';
  if (['failed', 'rejected', 'cancelled', 'reverted'].includes(normalizedStatus)) return 'failed';
  return 'neutral';
};

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
});

const getBankInformationError = (requestError) => {
  const status = requestError.response?.status;
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return 'Only landlord accounts can access bank information.';
  return requestError.response?.data?.message || 'Unable to load bank account information.';
};

const getBankListError = (requestError) => {
  const status = requestError.response?.status;
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return 'Only landlord accounts can load Chapa-supported banks.';
  return requestError.response?.data?.message ||
    (requestError.message === 'Network Error'
      ? 'Unable to reach the backend to load Chapa-supported banks. Check your connection and retry.'
      : requestError.message || 'Unable to load Chapa-supported banks. Please retry.');
};

const extractBankRecords = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['banks', 'data']) {
    const records = extractBankRecords(payload[key]);
    if (records.length) return records;
  }
  return [];
};

const normalizeBanksResponse = (response) => extractBankRecords(response?.data ?? response)
  .filter((bank) => {
    const canProcessPayouts = bank?.can_process_payouts;
    return canProcessPayouts === undefined ||
      ![false, 0, '0', 'false'].includes(
        typeof canProcessPayouts === 'string'
          ? canProcessPayouts.trim().toLowerCase()
          : canProcessPayouts
      );
  })
  .map((bank) => ({
    code: String(bank?.code ?? bank?.bank_code ?? bank?.id ?? '').trim(),
    name: String(bank?.name ?? bank?.bank_name ?? bank?.bankName ?? bank?.label ?? '').trim(),
  }))
  .filter((bank) => bank.code && bank.name);

const LandlordBankInformation = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [banks, setBanks] = useState([]);
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [copyFailed, setCopyFailed] = useState(false);
  const [expandedReferenceRows, setExpandedReferenceRows] = useState({});
  const [form, setForm] = useState({
    bankCode: '',
    accountName: user?.name || '',
    accountNumber: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [error, setError] = useState('');
  const [bankListError, setBankListError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');

  const loadBankInformation = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setBankListError('');
    try {
      const loadBanks = async () => {
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/bank-accounts/banks`,
          getAuthConfig()
        );
        const availableBanks = normalizeBanksResponse(response);
        if (availableBanks.length === 0) {
          throw new Error('Unable to load Chapa-supported banks. The bank list response contained no valid bank names and codes.');
        }
        return availableBanks;
      };

      const [banksResult, accountResult, transactionsResult] = await Promise.allSettled([
        loadBanks(),
        axios.get(`${process.env.REACT_APP_API_URL}/api/bank-accounts/my-account`, getAuthConfig()),
        axios.get(
          `${process.env.REACT_APP_API_URL}/api/bank-accounts/my-account/transactions`,
          getAuthConfig()
        ),
      ]);
      if (accountResult.status === 'rejected') throw accountResult.reason;
      if (transactionsResult.status === 'rejected') throw transactionsResult.reason;

      const availableBanks = banksResult.status === 'fulfilled' ? banksResult.value : [];
      if (banksResult.status === 'rejected') {
        setBankListError(getBankListError(banksResult.reason));
      }
      const accountResponse = accountResult.value;
      const transactionsResponse = transactionsResult.value;
      const savedAccount = accountResponse.data?.account || null;
      setBanks(availableBanks);
      setAccount(savedAccount);
      setTransactions(Array.isArray(transactionsResponse.data?.transactions)
        ? transactionsResponse.data.transactions
        : []);
      setForm({
        bankCode: savedAccount?.bankCode || '',
        accountName: savedAccount?.accountName || user?.name || '',
        accountNumber: '',
      });
    } catch (requestError) {
      setLoadError(getBankInformationError(requestError));
    } finally {
      setLoading(false);
    }
  }, [user?.name]);

  useEffect(() => {
    loadBankInformation();
  }, [loadBankInformation]);

  useEffect(() => {
    if (!showUpdateModal) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !saving) setShowUpdateModal(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showUpdateModal, saving]);

  const openCreateForm = () => {
    setForm({
      bankCode: '',
      accountName: user?.name || '',
      accountNumber: '',
    });
    setError('');
    setShowCreateForm(true);
  };

  const openUpdateModal = () => {
    setForm({
      bankCode: account?.bankCode || '',
      accountName: account?.accountName || user?.name || '',
      accountNumber: '',
    });
    setError('');
    setShowUpdateModal(true);
  };

  const saveBankAccount = async (event, isUpdate = false) => {
    event.preventDefault();
    if (saving) return;

    const selectedBank = banks.find((bank) => bank.code === form.bankCode);
    const accountName = form.accountName.trim();
    const accountNumber = form.accountNumber.trim();
    if (!selectedBank || !accountName || (!accountNumber && (!isUpdate || account?.bankAccountNeedsUpdate))) {
      setError('Select a bank and enter the account holder name and account number.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/bank-accounts`,
        {
          bankCode: selectedBank.code,
          bankName: selectedBank.name,
          accountName,
          ...(accountNumber ? { accountNumber } : {}),
        },
        getAuthConfig()
      );
      await loadBankInformation();
      setForm((previous) => ({ ...previous, accountName, accountNumber: '' }));
      setShowCreateForm(false);
      setShowUpdateModal(false);
      setMessage(response.data?.message || 'Bank account saved successfully.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save your bank account.');
    } finally {
      setSaving(false);
    }
  };

  const hasSavedAccountNumber = Boolean(
    account?.accountNumberMasked && !account?.bankAccountNeedsUpdate
  );
  const selectedBank = banks.find((bank) => bank.code === form.bankCode);
  const canSubmitForm = Boolean(
    selectedBank &&
    form.accountName.trim() &&
    (form.accountNumber.trim() || (showUpdateModal && hasSavedAccountNumber))
  );
  const periods = useMemo(
    () => [...new Set(transactions.map((transaction) => transaction.paymentPeriod).filter(Boolean))].sort().reverse(),
    [transactions]
  );
  const statuses = useMemo(
    () => [...new Set(transactions.map((transaction) => transaction.status).filter(Boolean))].sort(),
    [transactions]
  );
  const filteredTransactions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const direction = String(transaction.direction || '').toLowerCase();
      const referenceText = getTransactionReferences(transaction)
        .map((reference) => reference.value)
        .join(' ');
      const matchesSearch = !normalizedSearch || [
        transaction.tenant,
        transaction.property,
        referenceText,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      return matchesSearch &&
        (!periodFilter || transaction.paymentPeriod === periodFilter) &&
        (!typeFilter || direction === typeFilter) &&
        (!statusFilter || transaction.status === statusFilter);
    });
  }, [transactions, search, periodFilter, typeFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const visibleTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, periodFilter, typeFilter, statusFilter, pageSize]);

  const copyReference = async (reference) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(reference);
      setCopyFeedback(t('Reference copied.'));
      setCopyFailed(false);
    } catch {
      setCopyFeedback(t('Unable to copy reference.'));
      setCopyFailed(true);
    }
  };

  const renderFormFields = (isUpdate) => (
    <>
      <label htmlFor={isUpdate ? 'update-landlord-bank' : 'create-landlord-bank'}>
        Bank <span aria-hidden="true">*</span>
        <select
          id={isUpdate ? 'update-landlord-bank' : 'create-landlord-bank'}
          value={form.bankCode}
          onChange={(event) => setForm((current) => ({ ...current, bankCode: event.target.value }))}
          required
          disabled={saving || banks.length === 0}
        >
          <option value="">Select a bank</option>
          {banks.map((bank) => (
            <option key={bank.code} value={bank.code}>{bank.name} ({bank.code})</option>
          ))}
        </select>
      </label>

      <label htmlFor={isUpdate ? 'update-landlord-account-name' : 'create-landlord-account-name'}>
        Account Name <span aria-hidden="true">*</span>
        <input
          id={isUpdate ? 'update-landlord-account-name' : 'create-landlord-account-name'}
          type="text"
          value={form.accountName}
          onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))}
          placeholder="Enter account name (as on your bank account)"
          autoComplete="name"
          required
          disabled={saving}
        />
      </label>

      <label htmlFor={isUpdate ? 'update-landlord-account-number' : 'create-landlord-account-number'}>
        Account Number {!isUpdate && <span aria-hidden="true">*</span>}
        <input
          id={isUpdate ? 'update-landlord-account-number' : 'create-landlord-account-number'}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={form.accountNumber}
          onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
          placeholder={isUpdate && !account?.bankAccountNeedsUpdate
            ? 'Enter a new number or leave blank to keep current'
            : 'Enter account number'}
          required={!isUpdate || Boolean(account?.bankAccountNeedsUpdate)}
          disabled={saving}
        />
        {isUpdate && (
          <small className="bank-account-field-help">
            The saved number stays masked. Leave this blank to keep it unchanged.
          </small>
        )}
      </label>
    </>
  );

  return (
    <section className="landlord-account-page landlord-bank-information !m-0 !w-full !max-w-none !p-0 flex flex-col gap-3">
      <header className="landlord-bank-information-heading">
        <h1 className="m-0 text-2xl font-bold text-slate-800">{t('Bank Information')}</h1>
      </header>

      <div className={`bank-account-summary-grid${loading ? ' bank-account-summary-loading' : ''}`}>
        <section className="bank-account-summary-card bank-account-balance-card" aria-labelledby="available-balance-title">
          <h2 id="available-balance-title">{t('Available balance')}</h2>
          {loading ? (
            <div className="bank-account-balance-skeleton" role="status" aria-label={t('Loading balance')} />
          ) : (
            <p className="bank-account-balance-amount">{account?.currency || 'ETB'} {Number(account?.balance || 0).toLocaleString()}</p>
          )}
          <p className="bank-account-balance-caption">{t('Internal balance')}</p>
        </section>

        <section className="landlord-account-card bank-account-panel bank-account-summary-card !mb-0" aria-labelledby="bank-account-panel-title">
        <h2 id="bank-account-panel-title">{t('Bank account')}</h2>

        {message && <p className="landlord-account-message" role="status">{message}</p>}
        {bankListError && <p className="landlord-account-message" role="alert">{bankListError}</p>}
        {loadError ? (
          <div className="bank-account-load-error">
            <p className="landlord-account-message" role="alert">{loadError}</p>
            <button
              type="button"
              className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]"
              onClick={loadBankInformation}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Retry'}
            </button>
          </div>
        ) : loading ? (
          <p className="landlord-account-help" role="status">Loading bank information...</p>
        ) : account ? (
          <>
            {account.bankAccountNeedsUpdate && (
              <div className="bank-account-active-banner bank-account-warning-banner" role="status">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>Please update your bank account number</strong>
                  <p>The saved account number can no longer be securely read. Enter your bank account number again to restore payouts. Your internal rent credits are not affected.</p>
                </div>
              </div>
            )}

            <div className="bank-account-details">
              <dl>
                <div><dt>Bank</dt><dd>{account.bankName} ({account.bankCode})</dd></div>
                <div><dt>Account Name</dt><dd>{account.accountName}</dd></div>
                <div><dt>Account Number</dt><dd>{account.accountNumberMasked || '••••'}</dd></div>
                <div className="bank-account-status-row">
                  <dt>Status</dt>
                  <dd>
                    <span className={`bank-account-status ${account.bankAccountNeedsUpdate ? 'bank-account-status-warning' : String(account.status || 'active').toLowerCase() === 'active' ? 'bank-account-status-active' : 'bank-account-status-other'}`}>
                      {account.bankAccountNeedsUpdate ? t('Update needed') : String(account.status || 'active').toLowerCase() === 'active' ? t('Active') : account.status}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              className="landlord-account-button secondary bank-account-update-button"
              onClick={openUpdateModal}
            >
              Update Bank Account
            </button>
          </>
        ) : showCreateForm ? (
          <div className="bank-account-create-layout">
            <div className="bank-account-create-card">
              <h3>Create Bank Account</h3>
              <form className="landlord-account-form" onSubmit={(event) => saveBankAccount(event)}>
                {renderFormFields(false)}
                {error && <p className="landlord-account-message" role="alert">{error}</p>}
                <div className="landlord-account-actions">
                  <button type="submit" className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]" disabled={saving || !canSubmitForm}>
                    {saving ? 'Saving...' : 'Create Account'}
                  </button>
                  <button
                    type="button"
                    className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]"
                    onClick={() => {
                      setShowCreateForm(false);
                      setError('');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
                {banks.length === 0 && (
                  <p className="landlord-account-message" role="alert">No supported banks are available right now. Please retry later.</p>
                )}
              </form>
            </div>

            <aside className="bank-account-supported-card">
              <h3><span aria-hidden="true">✓</span> Supported Banks</h3>
              <p>Please select a bank from the available bank list.</p>
              <p>Only supported banks are allowed for account registration.</p>
              <details>
                <summary>View supported banks</summary>
                <ul>
                  {banks.map((bank) => <li key={bank.code}>{bank.name}</li>)}
                </ul>
              </details>
            </aside>
          </div>
        ) : (
          <div className="bank-account-empty-state">
            <span className="bank-account-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path d="M5 18h38M9 18v21m10-21v21m10-21v21m10-21v21M5 42h38M24 5 4 15h40L24 5Z" />
              </svg>
            </span>
            <h3>No payout bank account has been registered yet.</h3>
            <p>You need to create a bank account to receive rent payments from tenants.</p>
            <button type="button" className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]" onClick={openCreateForm}>
              <span aria-hidden="true">＋</span> Create Bank Account
            </button>
          </div>
        )}

      </section>
      </div>

      {!loadError && (
        <section className="bank-account-transactions" aria-labelledby="bank-account-transactions-title">
          <div className="bank-account-transactions-heading">
            <div>
              <h2 id="bank-account-transactions-title">{t('Account Transactions')}</h2>
              <p>{t('Internal rent credits are separate from external bank transfers.')}</p>
            </div>
          </div>
          {loading ? (
            <div className="bank-account-transactions-skeleton" role="status" aria-label={t('Loading transactions')}>
              <span />
              <span />
              <span />
            </div>
          ) : (
            <>
              <div className="bank-account-transaction-controls">
                <label>
                  <span className="sr-only">{t('Search transactions')}</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('Search tenant, property, or reference')}
                  />
                </label>
                <label>
                  <span className="sr-only">{t('Period')}</span>
                  <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
                    <option value="">{t('All periods')}</option>
                    {periods.map((period) => <option key={period} value={period}>{period}</option>)}
                  </select>
                </label>
                <label>
                  <span className="sr-only">{t('Type')}</span>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                    <option value="">{t('All types')}</option>
                    <option value="credit">{t('Credit')}</option>
                    <option value="debit">{t('Debit')}</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">{t('Status')}</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">{t('All statuses')}</option>
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              <p className="bank-account-result-count" aria-live="polite">
                {t('Showing {start}–{end} of {count}', {
                  start: filteredTransactions.length ? (currentPage - 1) * pageSize + 1 : 0,
                  end: Math.min(currentPage * pageSize, filteredTransactions.length),
                  count: filteredTransactions.length,
                })}
              </p>
              {transactions.length === 0 ? (
                <p className="landlord-account-help">{t('No transactions yet')}</p>
              ) : filteredTransactions.length === 0 ? (
                <p className="landlord-account-help">{t('No transactions match your filters.')}</p>
              ) : (
                <>
                  <div className="bank-account-transactions-wrap">
                    <table className="bank-account-transactions-table">
                      <thead>
                        <tr>
                          {[t('Date'), t('Period'), t('Tenant'), t('Property'), t('Amount'), t('Type'), t('Status'), t('Reference')]
                            .map((heading) => <th key={heading} scope="col">{heading}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTransactions.map((transaction) => {
                          const references = getTransactionReferences(transaction);
                          const primaryReference = references[0]?.value;
                          const direction = String(transaction.direction || '').toLowerCase();
                          const transactionType = direction === 'debit' ? 'Debit' : direction === 'credit' ? 'Credit' : '';
                          return (
                            <tr key={transaction.id}>
                              <td data-label={t('Date')}>{transaction.date ? new Date(transaction.date).toLocaleDateString() : '—'}</td>
                              <td data-label={t('Period')}>{transaction.paymentPeriod || '—'}</td>
                              <td data-label={t('Tenant')}>{transaction.tenant || '—'}</td>
                              <td data-label={t('Property')}>{transaction.property || '—'}</td>
                              <td className="bank-account-amount-cell" data-label={t('Amount')}>
                                {transaction.currency || 'ETB'} {Number(transaction.amount).toLocaleString()}
                              </td>
                              <td data-label={t('Type')}>
                                {transactionType ? (
                                  <span className={`bank-account-ledger-status bank-account-ledger-status-${transactionType.toLowerCase()}`}>
                                    {t(transactionType)}
                                  </span>
                                ) : '—'}
                              </td>
                              <td data-label={t('Status')}>
                                <span className={`bank-account-ledger-status bank-account-ledger-status-${getLedgerStatusClass(transaction.status)}`}>
                                  {transaction.status || '—'}
                                </span>
                              </td>
                                            <td data-label={t('Reference')}>
                                {primaryReference ? (
                                  <div className="bank-account-reference-cell">
                                                  <span>{shortenReference(primaryReference)}</span>
                                    <button
                                      type="button"
                                      className="bank-account-copy-button"
                                      aria-label={t('Copy reference {reference}', { reference: shortenReference(primaryReference) })}
                                      onClick={() => copyReference(primaryReference)}
                                    >
                                      {t('Copy reference')}
                                    </button>
                                    <button
                                      type="button"
                                      className="bank-account-reference-details-button"
                                      aria-expanded={Boolean(expandedReferenceRows[transaction.id])}
                                      aria-controls={`bank-account-references-${transaction.id}`}
                                      onClick={() => setExpandedReferenceRows((previous) => ({
                                        ...previous,
                                        [transaction.id]: !previous[transaction.id],
                                      }))}
                                    >
                                      {t('View reference details')}
                                    </button>
                                    {expandedReferenceRows[transaction.id] && (
                                      <ul className="bank-account-reference-details" id={`bank-account-references-${transaction.id}`}>
                                        {references.map((reference) => (
                                          <li key={`${reference.label}-${reference.value}`}>
                                            {t(reference.label)}: {reference.value}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {copyFeedback && (
                    <p className={`bank-account-copy-feedback${copyFailed ? ' is-error' : ''}`} role={copyFailed ? 'alert' : 'status'}>
                      {copyFeedback}
                    </p>
                  )}
                  <div className="bank-account-pagination">
                    <label>
                      {t('Rows per page')}
                      <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                        {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <nav aria-label={t('Transaction pagination')}>
                      <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                        {t('Previous')}
                      </button>
                      <span>{t('Page {current} of {total}', { current: currentPage, total: pageCount })}</span>
                      <button type="button" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={currentPage === pageCount}>
                        {t('Next')}
                      </button>
                    </nav>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {showUpdateModal && account && (
        <div
          className="bank-account-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowUpdateModal(false);
          }}
        >
          <section
            className="bank-account-update-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-account-update-title"
          >
            <div className="bank-account-modal-heading">
              <h2 id="bank-account-update-title">Update Bank Account</h2>
              <button
                type="button"
                className="bank-account-modal-close"
                aria-label="Close update bank account dialog"
                onClick={() => setShowUpdateModal(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>
            <form className="landlord-account-form" onSubmit={(event) => saveBankAccount(event, true)}>
              {renderFormFields(true)}
              {bankListError && <p className="landlord-account-message" role="alert">{bankListError}</p>}
              {!bankListError && banks.length === 0 && (
                <p className="landlord-account-message" role="alert">
                  No supported Chapa banks are available. Retry loading bank information before updating your account.
                </p>
              )}
              {error && <p className="landlord-account-message" role="alert">{error}</p>}
              <div className="landlord-account-actions">
                <button type="submit" className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]" disabled={saving || !canSubmitForm}>
                  {saving ? 'Saving...' : 'Update Account'}
                </button>
                <button
                  type="button"
                  className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setError('');
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
};

export default LandlordBankInformation;
