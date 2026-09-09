import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
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
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
          </div>
          
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="auth-submit"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <p className="auth-footer">
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
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