import React, { useEffect, useState } from 'react';
import axios from 'axios';

const LandlordProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [banks, setBanks] = useState([]);

  const [bankDetails, setBankDetails] = useState({
    bankAccountName: '',
    bankAccountNumber: '',
    bankCode: '',
  });

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        setErrorMessage('');

        const token = localStorage.getItem('token');

        if (!token) {
          setErrorMessage('Login token not found. Please login again.');
          return;
        }

        // ==============================
        // GET CURRENT USER
        // ==============================
        const response = await axios.get(
          'http://localhost:5000/api/auth/me',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const loadedProfile =
          response.data?.user || response.data;

        if (!loadedProfile) {
          setErrorMessage('User profile was not returned by the server.');
          return;
        }

        setProfile(loadedProfile);

        setBankDetails({
          bankAccountName:
            loadedProfile.bankAccountName || '',
          bankAccountNumber: '',
          bankCode:
            loadedProfile.bankCode || '',
        });

        // ==============================
        // GET BANKS
        // ==============================
        try {
          const banksResponse = await axios.get(
            'http://localhost:5000/api/payments/banks',
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          setBanks(
            Array.isArray(banksResponse.data)
              ? banksResponse.data
              : banksResponse.data?.banks || []
          );
        } catch (bankError) {
          console.error(
            'Bank loading error:',
            bankError
          );

          setBanks([]);
        }
      } catch (error) {
        console.error(
          'Profile loading error:',
          error
        );

        if (error.response) {
          setErrorMessage(
            error.response.data?.message ||
              `Server error: ${error.response.status}`
          );
        } else if (error.request) {
          setErrorMessage(
            'Backend server is not responding. Make sure the backend is running on port 5000.'
          );
        } else {
          setErrorMessage(
            error.message ||
              'Unable to load profile.'
          );
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  // ==============================
  // SAVE BANK DETAILS
  // ==============================
  const saveBankDetails = async (event) => {
    event.preventDefault();

    setSaving(true);
    setSaveMessage('');

    try {
      const token = localStorage.getItem('token');

      if (!token) {
        setSaveMessage(
          'Login token not found. Please login again.'
        );
        return;
      }

      const response = await axios.put(
        'http://localhost:5000/api/auth/profile',
        bankDetails,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const updatedUser =
        response.data?.user;

      if (updatedUser) {
        setProfile(updatedUser);
      }

      setSaveMessage(
        response.data?.message ||
          'Bank details saved successfully.'
      );

      setBankDetails((current) => ({
        ...current,
        bankAccountNumber: '',
      }));
    } catch (error) {
      console.error(
        'Bank details save error:',
        error
      );

      setSaveMessage(
        error.response?.data?.message ||
          'Unable to save bank details.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ==============================
  // LOADING
  // ==============================
  if (loading) {
    return (
      <div className="tenant-container tenant-section-page">
        <div className="tenant-header">
          <h1 className="tenant-title">
            👤 Profile
          </h1>
        </div>

        <div className="tenant-loading">
          Loading profile...
        </div>
      </div>
    );
  }

  // ==============================
  // ERROR
  // ==============================
  if (!profile) {
    return (
      <div className="tenant-container tenant-section-page">
        <div className="tenant-header">
          <h1 className="tenant-title">
            👤 Profile
          </h1>
        </div>

        <div className="tenant-empty">
          <h2>Profile could not be loaded</h2>

          <p>
            {errorMessage ||
              'Profile not available.'}
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">
          👤 Profile
        </h1>
      </div>

      {/* ==============================
          PROFILE INFORMATION
      ============================== */}
      <div className="tenant-request-detail-card">

        <div className="tenant-request-detail-row">
          <strong>Name:</strong>
          <span>
            {profile.name || 'N/A'}
          </span>
        </div>

        <div className="tenant-request-detail-row">
          <strong>Email:</strong>
          <span>
            {profile.email || 'N/A'}
          </span>
        </div>

        <div className="tenant-request-detail-row">
          <strong>Phone:</strong>
          <span>
            {profile.phone || 'N/A'}
          </span>
        </div>

        <div className="tenant-request-detail-row">
          <strong>Role:</strong>
          <span>
            {profile.role || 'landlord'}
          </span>
        </div>

        {/* ==============================
            BANK DETAILS
        ============================== */}

        <form
          onSubmit={saveBankDetails}
          className="payment-form"
        >
          <h2>
            Chapa payout bank details
          </h2>

          <p className="payment-muted">
            Bank details are sent securely to
            the backend for landlord payouts.
          </p>

          {profile.bankAccountMasked && (
            <p className="payment-muted">
              Bank:{' '}
              {profile.bankName ||
                'Configured'}
              {' · '}
              Account:{' '}
              {profile.bankAccountMasked}
              {' · '}
              Status: Configured
            </p>
          )}

          {/* BANK */}
          <label htmlFor="bank-code">
            Bank
          </label>

          <select
            id="bank-code"
            value={bankDetails.bankCode}
            onChange={(event) =>
              setBankDetails({
                ...bankDetails,
                bankCode:
                  event.target.value,
              })
            }
            required
          >
            <option value="" disabled>
              Select a bank
            </option>

            {banks.map((bank) => (
              <option
                key={bank.code}
                value={bank.code}
              >
                {bank.name}
              </option>
            ))}
          </select>

          {/* ACCOUNT NAME */}
          <label htmlFor="bank-account-name">
            Account name
          </label>

          <input
            id="bank-account-name"
            type="text"
            value={
              bankDetails.bankAccountName
            }
            onChange={(event) =>
              setBankDetails({
                ...bankDetails,
                bankAccountName:
                  event.target.value,
              })
            }
            required
          />

          {/* ACCOUNT NUMBER */}
          <label htmlFor="bank-account-number">
            Account number
          </label>

          <input
            id="bank-account-number"
            type="password"
            value={
              bankDetails.bankAccountNumber
            }
            onChange={(event) =>
              setBankDetails({
                ...bankDetails,
                bankAccountNumber:
                  event.target.value,
              })
            }
            required
          />

          <button
            type="submit"
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : 'Save bank details'}
          </button>

          {saveMessage && (
            <p className="payment-muted">
              {saveMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default LandlordProfile;