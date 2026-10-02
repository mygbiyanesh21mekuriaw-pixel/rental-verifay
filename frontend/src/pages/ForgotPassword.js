import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devResetUrl, setDevResetUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitRequest = async (event) => {
    event.preventDefault();
    setMessage('');
    setDevResetUrl('');
    setError('');
    setLoading(true);
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/auth/forgot-password`, { email });
      setMessage(response.data?.message || 'If an account exists for that email, password reset instructions will be sent.');
      setDevResetUrl(response.data?.devResetUrl || '');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to process your request right now. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="rv-kicker">House Rental</span>
        <h2>Forgot your password?</h2>
        <p className="auth-subtitle">Enter your registered email address and we&apos;ll send you a password reset link.</p>

        {message && <div className="auth-success" role="status">{message}</div>}
        {devResetUrl && (
          <div className="auth-dev-reset-link">
            <a href={devResetUrl}>Open development reset link</a>
          </div>
        )}
        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={submitRequest} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@gmail.com"
              required
            />
          </div>
          <button type="submit" className="auth-submit" disabled={loading || !email.trim()}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="auth-footer"><Link to="/login">Back to Login</Link></p>
      </div>
    </div>
  );
};

export default ForgotPassword;

