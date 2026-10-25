import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiUrl } from '../utils/apiUrl';

const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const ChangePassword = () => {
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitPassword = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError(t('Password must be at least 8 characters.'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('Passwords do not match.'));
      return;
    }

    setLoading(true);
    try {
      await axios.post(apiUrl('/api/change-password'), { newPassword });
      const updatedUser = { ...user, mustChangePassword: false };
      updateUser(updatedUser);
      navigate(dashboardPaths[user?.role] || '/', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || t('Unable to change password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card" aria-labelledby="first-login-password-title">
        <span className="rv-kicker">{t('Account security')}</span>
        <h2 id="first-login-password-title">{t('Change Password')}</h2>
        <p className="auth-subtitle">{t('Choose a new password to continue to your dashboard.')}</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form onSubmit={submitPassword} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="first-login-new-password">{t('New Password')}</label>
            <div className="auth-password-control">
              <input
                id="first-login-new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={t(showPassword ? 'Hide password' : 'Show password')}
                title={t(showPassword ? 'Hide password' : 'Show password')}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="first-login-confirm-password">{t('Confirm Password')}</label>
            <div className="auth-password-control">
              <input
                id="first-login-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={t(showConfirmPassword ? 'Hide confirm password' : 'Show confirm password')}
                title={t(showConfirmPassword ? 'Hide confirm password' : 'Show confirm password')}
                onClick={() => setShowConfirmPassword((current) => !current)}
              >
                {showConfirmPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
              </button>
            </div>
          </div>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? t('Saving...') : t('Change Password')}
          </button>
        </form>
      </section>
    </div>
  );
};

export default ChangePassword;