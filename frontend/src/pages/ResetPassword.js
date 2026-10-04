import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);

  const submitReset = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (!token) {
      setError('This password reset link is invalid or incomplete. Request a new link.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/auth/reset-password`, {
        token,
        newPassword: password,
      });
      setMessage(response.data?.message || 'Password updated successfully.');
      setComplete(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to reset your password. Request a new link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="rv-kicker">House Rental</span>
        <h2>Create new password</h2>
        <p className="auth-subtitle">Choose a new password for your account.</p>

        {message && <div className="auth-success" role="status">{message}</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}

        {!complete && (
          <form onSubmit={submitReset} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) =>setPassword(event.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) =>setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Updating...' : 'Reset Password'}
            </button>
          </form>
        )}

        {complete && <p className="auth-footer"><Link to="/login">Return to Login</Link></p>}
        {!complete && <p className="auth-footer"><Link to="/forgot-password">Request a new reset link</Link></p>}
      </div>
    </div>
  );
};

export default ResetPassword;

