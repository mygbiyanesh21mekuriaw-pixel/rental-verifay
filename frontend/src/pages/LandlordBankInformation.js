import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

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
  const [banks, setBanks] = useState([]);
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
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
    <section className="landlord-account-page landlord-bank-information">
      <header className="landlord-account-heading landlord-bank-information-heading">
        <div>
          <p>LANDLORD WORKSPACE</p>
          <h1>Bank Information</h1>
          <span>Manage your saved bank details and view rent credits. Transfers are sent through Chapa and confirmed before they are marked executed.</span>
        </div>
      </header>

      <section className="landlord-account-card bank-account-panel" aria-labelledby="bank-account-panel-title">
        <h2 id="bank-account-panel-title">Bank Information</h2>

        {message && <p className="landlord-account-message" role="status">{message}</p>}
        {bankListError && <p className="landlord-account-message" role="alert">{bankListError}</p>}
        {loadError ? (
          <div className="bank-account-load-error">
            <p className="landlord-account-message" role="alert">{loadError}</p>
            <button
              type="button"
              className="landlord-account-button"
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
            <div className={`bank-account-active-banner${account.bankAccountNeedsUpdate ? ' bank-account-warning-banner' : ''}`}>
              <span aria-hidden="true">{account.bankAccountNeedsUpdate ? '!' : '✓'}</span>
              <div>
                <strong>{account.bankAccountNeedsUpdate ? 'Please update your bank account number' : 'Your bank account is active'}</strong>
                <p>{account.bankAccountNeedsUpdate
                  ? 'The saved account number can no longer be securely read. Enter your bank account number again to restore payouts. Your internal rent credits are not affected.'
                  : 'Verified live rent payments are submitted to this bank account through Chapa. Sandbox requests are simulations and do not move real bank funds. A transfer is marked executed only after Chapa confirms a live transfer.'}</p>
              </div>
              <span className="bank-account-status">{account.bankAccountNeedsUpdate ? 'Update needed' : 'Active'}</span>
            </div>

            <div className="bank-account-details">
              <h3>Bank Account Details</h3>
              <dl>
                <div><dt>Bank</dt><dd>{account.bankName} ({account.bankCode})</dd></div>
                <div><dt>Account Name</dt><dd>{account.accountName}</dd></div>
                <div><dt>Account Number</dt><dd>{account.accountNumberMasked || '••••'}</dd></div>
                <div><dt>Status</dt><dd className={account.bankAccountNeedsUpdate ? '' : 'bank-account-active-text'}>{account.bankAccountNeedsUpdate ? 'Update needed' : 'Active'}</dd></div>
                <div><dt>Internal Available Balance</dt><dd>{account.currency || 'ETB'} {Number(account.balance || 0).toLocaleString()}</dd></div>
              </dl>
              <p className="bank-account-field-help">
                This is your internal platform balance, not the balance in your {account.bankName} account. External transfers appear only after Chapa confirms them.
              </p>
            </div>

            <button
              type="button"
              className="landlord-account-button secondary"
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
                  <button type="submit" className="landlord-account-button" disabled={saving || !canSubmitForm}>
                    {saving ? 'Saving...' : 'Create Account'}
                  </button>
                  <button
                    type="button"
                    className="landlord-account-button"
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
            <button type="button" className="landlord-account-button" onClick={openCreateForm}>
              <span aria-hidden="true">＋</span> Create Bank Account
            </button>
          </div>
        )}

        {!loadError && !loading && (
          <section className="bank-account-transactions" aria-labelledby="bank-account-transactions-title">
            <div className="bank-account-transactions-heading">
              <div>
                <h3 id="bank-account-transactions-title">Account Transactions</h3>
                <p>Internal rent credits are separate from external bank transfers.</p>
              </div>
            </div>
            {transactions.length === 0 ? (
              <p className="landlord-account-help">No account transactions have been recorded yet.</p>
            ) : (
              <div className="bank-account-transactions-wrap">
                <table className="bank-account-transactions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Tenant</th>
                      <th>Property</th>
                      <th>Amount</th>
                      <th>Credit/Debit</th>
                      <th>Landlord Credit</th>
                      <th>External Transfer</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{transaction.date ? new Date(transaction.date).toLocaleDateString() : '—'}</td>
                        <td>{transaction.description}</td>
                        <td>{transaction.tenant}</td>
                        <td>{transaction.property}</td>
                        <td>{transaction.currency || 'ETB'} {Number(transaction.amount).toLocaleString()}</td>
                        <td>{transaction.direction}</td>
                        <td>{transaction.status}</td>
                        <td>
                          <div className="bank-account-transfer-status">
                            <span className={`bank-account-transfer-badge bank-account-transfer-badge-${String(transaction.externalTransferStatus || 'NOT_EXECUTED').toLowerCase().replace(/_/g, '-')}`}>
                              {String(transaction.externalTransferStatus || 'NOT_EXECUTED').replace(/_/g, ' ')}
                            </span>
                            {transaction.payoutMode === 'sandbox' ? (
                              <small className="bank-account-transfer-detail">
                                Sandbox only
                                {transaction.payoutFailureReason?.startsWith('Sandbox payout was not submitted.')
                                  ? ' — not submitted'
                                  : transaction.sandboxTransferStatus
                                  ? ` — ${transaction.sandboxTransferStatus === 'PROCESSING' &&
                                    /payout remains unconfirmed/i.test(transaction.payoutFailureReason || '')
                                    ? 'verification incomplete'
                                    : transaction.sandboxTransferStatus.toLowerCase()}`
                                  : transaction.payoutStatus
                                    ? ` — ${transaction.payoutStatus.toLowerCase()} simulation`
                                    : ''}
                                ; no real bank transfer was made.
                              </small>
                            ) : (
                              <>
                                {transaction.payoutStatus && (
                                  <small className="bank-account-transfer-detail">
                                    Payout status: {transaction.payoutStatus.toLowerCase()}
                                  </small>
                                )}
                                {transaction.providerRequestResponse && (
                                  <small className="bank-account-transfer-detail">
                                    Chapa submission: {transaction.providerRequestResponse.apiStatus || 'unknown'}
                                    {transaction.providerRequestResponse.httpStatus
                                      ? ` (HTTP ${transaction.providerRequestResponse.httpStatus})`
                                      : ''}
                                    {transaction.providerRequestResponse.message
                                      ? ` — ${transaction.providerRequestResponse.message}`
                                      : ''}
                                  </small>
                                )}
                                {transaction.providerVerificationResponse && (
                                  <small className="bank-account-transfer-detail">
                                    Chapa verification: {transaction.providerVerificationResponse.status || 'unknown'}
                                    {transaction.providerVerificationResponse.httpStatus
                                      ? ` (HTTP ${transaction.providerVerificationResponse.httpStatus})`
                                      : ''}
                                    {transaction.providerVerificationResponse.message
                                      ? ` — ${transaction.providerVerificationResponse.message}`
                                      : ''}
                                  </small>
                                )}
                                {transaction.payoutFailureReason && (
                                  <small className="bank-account-transfer-detail">{transaction.payoutFailureReason}</small>
                                )}
                              </>
                            )}
                            {transaction.payoutMode === 'sandbox' &&
                              (['FAILED', 'PROCESSING'].includes(transaction.sandboxTransferStatus) ||
                                (transaction.payoutStatus === 'PENDING' && transaction.payoutFailureReason)) && (
                              <>
                                {transaction.providerRequestResponse && (
                                  <small className="bank-account-transfer-detail">
                                    Chapa submission: {transaction.providerRequestResponse.apiStatus || 'unknown'}
                                    {transaction.providerRequestResponse.httpStatus
                                      ? ` (HTTP ${transaction.providerRequestResponse.httpStatus})`
                                      : ''}
                                    {transaction.providerRequestResponse.message
                                      ? ` — ${transaction.providerRequestResponse.message}`
                                      : ''}
                                  </small>
                                )}
                                {transaction.providerVerificationResponse && (
                                  <small className="bank-account-transfer-detail">
                                    Chapa verification: {transaction.providerVerificationResponse.status || 'unknown'}
                                    {transaction.providerVerificationResponse.httpStatus
                                      ? ` (HTTP ${transaction.providerVerificationResponse.httpStatus})`
                                      : ''}
                                    {transaction.providerVerificationResponse.message
                                      ? ` — ${transaction.providerVerificationResponse.message}`
                                      : ''}
                                  </small>
                                )}
                                {transaction.payoutFailureReason && (
                                  <small className="bank-account-transfer-detail">{transaction.payoutFailureReason}</small>
                                )}
                              </>
                            )}
                            {transaction.externalTransferStatus === 'EXECUTED' && transaction.payoutReference && (
                              <small className="bank-account-transfer-detail">
                                Payout reference: {transaction.payoutReference}
                              </small>
                            )}
                            {transaction.externalTransferStatus === 'EXECUTED' && transaction.providerReference && (
                              <small className="bank-account-transfer-detail">
                                Chapa transfer reference: {transaction.providerReference}
                              </small>
                            )}
                          </div>
                        </td>
                        <td>{transaction.providerTransactionReference || transaction.paymentReference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </section>

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
                <button type="submit" className="landlord-account-button" disabled={saving || !canSubmitForm}>
                  {saving ? 'Saving...' : 'Update Account'}
                </button>
                <button
                  type="button"
                  className="landlord-account-button"
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
