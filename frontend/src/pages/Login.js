import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const platformAdminEmail = 'platform.admin@rentalverify.com';

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
    <path d="M3 3l18 18" strokeLinecap="round" />
    <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" strokeLinecap="round" />
    <path d="M9.9 5.3A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-4.6 5.5M6.7 6.7A17.7 17.7 0 0 0 2 12s3.5 7 10 7a11.8 11.8 0 0 0 5.3-1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const validateLoginForm = ({ email, password }) => {
  const nextErrors = {};
  const trimmedEmail = String(email || '').trim();

  if (!trimmedEmail) {
    nextErrors.email = 'Email is required';
  } else if (!emailPattern.test(trimmedEmail)) {
    nextErrors.email = 'Please enter a valid email address';
  }

  if (!password) {
    nextErrors.password = 'Password is required';
  } else if (String(password).length < 6) {
    nextErrors.password = 'Password must be at least 6 characters';
  }

  return nextErrors;
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role) {
      navigate(dashboardPaths[user.role] || '/', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationErrors = validateLoginForm({ email, password });
    setFieldErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      navigate(dashboardPaths[result.user.role] || '/', { replace: true });
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="rv-kicker">RentalVerify</span>
        <h2>Welcome back</h2>
        <p className="auth-subtitle">Sign in to manage your verified rental journey.</p>
        
        {error && <div className="auth-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((current) => ({ ...current, email: '' }));
                }
              }}
              required
              aria-invalid={Boolean(fieldErrors.email)}
              className={fieldErrors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}
              placeholder="your@email.com"
            />
            {fieldErrors.email && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.email}</p>}
          </div>
          
          <div className="auth-field">
            <label>Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((current) => ({ ...current, password: '' }));
                  }
                }}
                required
                aria-invalid={Boolean(fieldErrors.password)}
                className={`pr-11 ${fieldErrors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}`}
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-700"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {fieldErrors.password && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.password}</p>}
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="auth-submit"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        {email.trim().toLowerCase() !== platformAdminEmail && (
          <p className="auth-footer">
            Don&apos;t have an account? <Link to="/register">Register</Link>
          </p>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '80vh',
    backgroundColor: '#f5f7fa',
  },
  card: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    textAlign: 'center',
    marginBottom: '30px',
    color: '#2d3748',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontWeight: '600',
    color: '#2d3748',
    fontSize: '14px',
  },
  input: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    fontSize: '16px',
    transition: 'border-color 0.2s',
  },
  button: {
    padding: '12px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  error: {
    backgroundColor: '#fed7d7',
    color: '#9b2c2c',
    padding: '10px',
    borderRadius: '8px',
    marginBottom: '15px',
    fontSize: '14px',
  },
  footer: {
    textAlign: 'center',
    marginTop: '20px',
    color: '#718096',
  },
  link: {
    color: '#4299e1',
    textDecoration: 'none',
    fontWeight: '600',
  },
};

export default Login;