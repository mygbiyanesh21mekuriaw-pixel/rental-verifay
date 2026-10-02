import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const LandlordBankInformation = () => {
  const { user, updateUser } = useAuth();
  const [banks, setBanks] = useState([]);
  const [bankDetails, setBankDetails] = useState({
    bankAccountName: user?.bankAccountName || '',
    bankAccountNumber: '',
    bankCode: user?.bankCode || '',
  });
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankLoadError, setBankLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadBanks = useCallback(async () => {
    setLoadingBanks(true);
    setBankLoadError('');
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/payments/banks`, { timeout: 20000 });
      const records = Array.isArray(response.data)
        ? response.data
        : response.data?.banks || response.data?.data?.banks || [];
      const available = records
        .map((bank) => ({
          name: bank.name || bank.bank_name || bank.bankName,
          code: String(bank.code ?? bank.bank_code ?? bank.bank_slug ?? bank.slug ?? bank.id ?? '').trim(),
        }))
        .filter((bank) => bank.name && bank.code);
      setBanks(available);
      if (!available.length) {
        setBankLoadError('Chapa returned no supported banks. Check the backend Chapa configuration and try again.');
      }
    } catch (error) {
      console.error('Bank loading error:', error);
      setBanks([]);
      setBankLoadError(error.response?.data?.message || 'Could not load Chapa-supported banks. Check the backend configuration and retry.');
    } finally {
      setLoadingBanks(false);
    }
  }, []);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  const selectedBankIsAvailable = banks.some((bank) => bank.code === bankDetails.bankCode);

  const saveBankDetails = async (event) => {
    event.preventDefault();
    if (!selectedBankIsAvailable) {
      setMessage('Choose a bank from the current Chapa-supported bank list.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await axios.put(`${process.env.REACT_APP_API_URL}/api/auth/profile`, bankDetails);
      if (!response.data?.user) throw new Error('The server did not return the updated account.');
      updateUser(response.data.user);
      setBankDetails((current) => ({ ...current, bankAccountNumber: '' }));
      setMessage(response.data.message || 'Bank information saved successfully.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to save bank information.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="landlord-account-page">
      <header className="landlord-account-heading">
        <div>
          <p>LANDLORD</p>
          <h1>Bank Information</h1>
          <span>Manage the bank account used for rental payouts.</span>
        </div>
      </header>

      <section className="landlord-account-card">
        <h2>Chapa payout bank details</h2>
        <p className="landlord-account-help">Bank details are sent securely to the backend for landlord payouts.</p>
        {user?.bankAccountMasked && (
          <p className="landlord-account-help">
            Current account: {user.bankName || 'Configured'} · {user.bankAccountMasked}
          </p>
        )}
        <form className="landlord-account-form" onSubmit={saveBankDetails}>
          <label>
            Bank
            <select
              value={bankDetails.bankCode}
              onChange={(event) => setBankDetails((current) => ({ ...current, bankCode: event.target.value }))}
              required
              disabled={loadingBanks || banks.length === 0}
            >
              <option value="" disabled>{loadingBanks ? 'Loading supported banks...' : 'Select a supported bank'}</option>
              {banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
            </select>
          </label>
          <label>
            Account name
            <input
              value={bankDetails.bankAccountName}
              onChange={(event) => setBankDetails((current) => ({ ...current, bankAccountName: event.target.value }))}
              placeholder="Name registered on your bank account"
              required
            />
          </label>
          <label>
            Account number
            <input
              type="password"
              autoComplete="off"
              value={bankDetails.bankAccountNumber}
              onChange={(event) => setBankDetails((current) => ({ ...current, bankAccountNumber: event.target.value }))}
              placeholder="Enter your real bank account number"
              required
            />
          </label>
          <button type="submit" className="landlord-account-button" disabled={saving || loadingBanks || !selectedBankIsAvailable}>
            {saving ? 'Saving...' : 'Save Bank Information'}
          </button>
          {bankLoadError && (
            <div>
              <p className="landlord-account-message" role="alert">{bankLoadError}</p>
              <button type="button" className="landlord-account-button" onClick={loadBanks} disabled={loadingBanks}>
                {loadingBanks ? 'Loading banks...' : 'Retry loading banks'}
              </button>
            </div>
          )}
          {message && <p className="landlord-account-message" role="status">{message}</p>}
        </form>
      </section>
    </section>
  );
};

export default LandlordBankInformation;
