import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const LandlordAccountSettings = () => {
  const { user, updateUser } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [emailMessage, setEmailMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setEmail(user?.email || '');
  }, [user?.email]);

  const saveEmail = async (event) => {
    event.preventDefault();
    setSavingEmail(true);
    setEmailMessage('');
    try {
      const response = await axios.put(`${process.env.REACT_APP_API_URL}/api/auth/profile`, { email });
      if (!response.data?.user) throw new Error('The server did not return the updated account.');
      updateUser(response.data.user);
      setEmail(response.data.user.email || '');
      setEmailMessage(response.data.message || 'Email updated successfully.');
    } catch (error) {
      setEmailMessage(error.response?.data?.message || error.message || 'Unable to update email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage('');
    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_API_URL}/api/auth/change-password`,
        { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }
      );
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage(response.data?.message || 'Password changed successfully.');
    } catch (error) {
      setPasswordMessage(error.response?.data?.message || 'Unable to change your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="landlord-account-page">
      <header className="landlord-account-heading">
        <div>
          <p>LANDLORD</p>
          <h1>Account Settings</h1>
          <span>Update your sign-in email and password.</span>
        </div>
      </header>

      <section className="landlord-account-card">
        <h2>Email address</h2>
        <form className="landlord-account-form" onSubmit={saveEmail}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <button type="submit" className="landlord-account-button" disabled={savingEmail}>
            {savingEmail ? 'Saving...' : 'Save Email'}
          </button>
          {emailMessage && <p className="landlord-account-message" role="status">{emailMessage}</p>}
        </form>
      </section>

      <section className="landlord-account-card">
        <h2>Password</h2>
        <form className="landlord-account-form" onSubmit={changePassword}>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              required
            />
          </label>
          <button type="submit" className="landlord-account-button" disabled={savingPassword}>
            {savingPassword ? 'Saving...' : 'Change Password'}
          </button>
          {passwordMessage && <p className="landlord-account-message" role="status">{passwordMessage}</p>}
        </form>
      </section>
    </section>
  );
};

export default LandlordAccountSettings;
