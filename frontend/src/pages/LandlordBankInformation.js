import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const getBankInformationError = (requestError) => {
  const status = requestError.response?.status;
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return 'Only landlord accounts can access demo bank information.';
  if (status === 404) {
    return 'The demo bank API route was not found. Restart the backend server and try again.';
  }
  return requestError.response?.data?.message || 'Unable to load demo bank account information.';
};

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
});

const LandlordBankInformation = () => {
  const { user } = useAuth();
  const [banks, setBanks] = useState([]);
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [message, setMessage] = useState('');

  const loadBankInformation = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadError('');
    setHistoryError('');
    try {
      const [banksResponse, accountResponse] = await Promise.all([
        axios.get(`${process.env.REACT_APP_API_URL}/api/bank-accounts/demo/banks`, getAuthConfig()),
        axios.get(`${process.env.REACT_APP_API_URL}/api/bank-accounts/my-account`, getAuthConfig()),
      ]);
      setBanks(Array.isArray(banksResponse.data) ? banksResponse.data : []);
      setAccount(accountResponse.data?.account || null);
      try {
        const transactionsResponse = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/bank-accounts/my-account/transactions`,
          getAuthConfig()
        );
        setTransactions(Array.isArray(transactionsResponse.data?.transactions)
          ? transactionsResponse.data.transactions
          : []);
      } catch (requestError) {
        setTransactions([]);
        setHistoryError(getBankInformationError(requestError));
      }
    } catch (requestError) {
      setLoadError(getBankInformationError(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBankInformation();
  }, [loadBankInformation]);

  const createAccount = async (event) => {
    event.preventDefault();
    if (!selectedBankCode || creating) return;

    setCreating(true);
    setError('');
    setMessage('');
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/bank-accounts/demo`,
        { bankCode: selectedBankCode },
        getAuthConfig()
      );
      setAccount(response.data?.account || null);
      setMessage(response.data?.message || 'Your demo bank account is now active.');
      await loadBankInformation();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to create the demo bank account.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="landlord-account-page">
      <header className="landlord-account-heading landlord-bank-information-heading">
        <div>
          <p>LANDLORD</p>
          <h1>Bank Information</h1>
          <span>Manage your internal demo account used for rent payment simulation.</span>
        </div>
      </header>

      <section className="landlord-account-card">
        <h2>DEMO BANK ACCOUNT</h2>
        <p className="landlord-account-message" role="note">
          This account is created inside the Rental Verification Portal for university project
          simulation. It is NOT a real bank account and does not connect to CBE, Awash Bank, or
          any real financial institution.
        </p>

        {loading ? (
          <p className="landlord-account-help" role="status">Loading demo account...</p>
        ) : loadError ? (
          <p className="landlord-account-message" role="alert">{loadError}</p>
        ) : account ? (
          <>
            {message && <p className="landlord-account-message" role="status">{message}</p>}
            <div className="landlord-account-summary">
              <h3>✓ Demo Bank Account Active</h3>
              <p><strong>Bank:</strong> {account.bankName} ({account.bankCode})</p>
              <p><strong>Account Name:</strong> {account.accountName}</p>
              <p><strong>DEMO ACCOUNT NUMBER:</strong> {account.accountNumber}</p>
              <p><strong>Balance:</strong> {Number(account.balance || 0).toFixed(2)} ETB</p>
              <p><strong>Status:</strong> {account.status
                ? account.status.charAt(0).toUpperCase() + account.status.slice(1)
                : 'Unknown'}</p>
            </div>
            <h3>Payment History</h3>
            {historyError ? (
              <p className="landlord-account-message" role="alert">{historyError}</p>
            ) : transactions.length === 0 ? (
              <p className="landlord-account-help">No rent payments have been credited yet.</p>
            ) : (
              <div className="payment-table-wrap">
                <table className="payment-table">
                  <thead>
                    <tr>
                      <th>Payment Date</th>
                      <th>Tenant</th>
                      <th>Property</th>
                      <th>Amount</th>
                      <th>Payment Status</th>
                      <th>Credited To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{transaction.creditedAt ? new Date(transaction.creditedAt).toLocaleString() : 'N/A'}</td>
                        <td>{transaction.tenant}</td>
                        <td>{transaction.property}</td>
                        <td>{transaction.currency} {Number(transaction.amount).toLocaleString()}</td>
                        <td>{transaction.paymentStatus}</td>
                        <td>{transaction.creditedTo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              className="landlord-account-button"
              onClick={loadBankInformation}
              disabled={loading}
            >
              Refresh Balance and History
            </button>
          </>
        ) : (
          <>
            <p className="landlord-account-help">You don't have a demo bank account configured yet.</p>
            {error && <p className="landlord-account-message" role="alert">{error}</p>}
            <form className="landlord-account-form" onSubmit={createAccount}>
              <label htmlFor="demo-bank">Bank
                <select
                  id="demo-bank"
                  value={selectedBankCode}
                  onChange={(event) => setSelectedBankCode(event.target.value)}
                  required
                  disabled={banks.length === 0 || creating}
                >
                  <option value="" disabled>Select a demo bank</option>
                  {banks.map((bank) => (
                    <option value={bank.code} key={bank.code}>{bank.name}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="demo-account-name">Account Name
                <input
                  id="demo-account-name"
                  value={user?.name || ''}
                  readOnly
                  aria-readonly="true"
                />
              </label>
              <p className="landlord-account-help">
                The system assigns a numeric demo number using this bank's configured demo format.
                It is an internal DEMO ACCOUNT number, not a real bank account number.
              </p>
              <button
                type="submit"
                className="landlord-account-button"
                disabled={creating || !selectedBankCode}
              >
                {creating ? 'Creating Demo Account...' : 'Create Demo Bank Account'}
              </button>
            </form>
          </>
        )}
        {!loading && error && account && <p className="landlord-account-message" role="alert">{error}</p>}
      </section>
    </section>
  );
};

export default LandlordBankInformation;
