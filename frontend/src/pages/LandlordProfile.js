import React, { useEffect, useState } from 'react';
import axios from 'axios';

const LandlordProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState([]);
  const [bankDetails, setBankDetails] = useState({ bankAccountName: '', bankAccountNumber: '', bankCode: '' });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://localhost:5000/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const loadedProfile = response.data.user || response.data;
        setProfile(loadedProfile);
        setBankDetails({ bankAccountName: loadedProfile.bankAccountName || '', bankAccountNumber: '', bankCode: loadedProfile.bankCode || '' });
        const banksResponse = await axios.get('http://localhost:5000/api/payments/banks', { headers: { Authorization: `Bearer ${token}` } });
        setBanks(Array.isArray(banksResponse.data) ? banksResponse.data : []);
      } catch (error) {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const saveBankDetails = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveMessage('');
    try {
      const token = localStorage.getItem('token');
      await axios.put('http://localhost:5000/api/auth/profile', bankDetails, { headers: { Authorization: `Bearer ${token}` } });
      setSaveMessage('Bank details saved securely.');
      setProfile((current) => ({ ...current, bankName: banks.find((bank) => bank.code === bankDetails.bankCode)?.name || current.bankName, bankCode: bankDetails.bankCode, bankAccountMasked: `********${bankDetails.bankAccountNumber.slice(-4)}` }));
      setBankDetails((current) => ({ ...current, bankAccountNumber: '' }));
    } catch (error) {
      setSaveMessage(error.response?.data?.message || 'Unable to save bank details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">👤 Profile</h1>
      </div>

      {loading ? (
        <div className="tenant-loading">Loading profile...</div>
      ) : !profile ? (
        <div className="tenant-empty">
          <p>Profile not available.</p>
        </div>
      ) : (
        <div className="tenant-request-detail-card">
          <div className="tenant-request-detail-row">
            <strong>Name:</strong>
            <span>{profile.name || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Email:</strong>
            <span>{profile.email || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Phone:</strong>
            <span>{profile.phone || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Role:</strong>
            <span>{profile.role || 'landlord'}</span>
          </div>
          <form onSubmit={saveBankDetails} className="payment-form">
            <h2>Chapa payout bank details</h2>
            <p className="payment-muted">Bank details are sent only to the backend for landlord payouts.</p>
            {profile.bankAccountMasked && <p className="payment-muted">Bank: {profile.bankName || 'Configured'} · Account: {profile.bankAccountMasked} · Status: Configured</p>}
            <label htmlFor="bank-code">Bank</label>
            <select id="bank-code" value={bankDetails.bankCode} onChange={(event) => setBankDetails({ ...bankDetails, bankCode: event.target.value })} required>
              <option value="" disabled>Select a bank</option>
              {banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
            </select>
            <label htmlFor="bank-account-name">Account name</label>
            <input id="bank-account-name" value={bankDetails.bankAccountName} onChange={(event) => setBankDetails({ ...bankDetails, bankAccountName: event.target.value })} required />
            <label htmlFor="bank-account-number">Account number</label>
            <input id="bank-account-number" type="password" value={bankDetails.bankAccountNumber} onChange={(event) => setBankDetails({ ...bankDetails, bankAccountNumber: event.target.value })} required />
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save bank details'}</button>
            {saveMessage && <p className="payment-muted">{saveMessage}</p>}
          </form>
        </div>
      )}
    </div>
  );
};

export default LandlordProfile;
