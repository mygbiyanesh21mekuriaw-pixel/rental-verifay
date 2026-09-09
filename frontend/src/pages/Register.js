import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    profilePhoto: '',
    role: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { register, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role) {
      navigate(dashboardPaths[user.role] || '/', { replace: true });
    }
  }, [user, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!formData.role) {
      setError('Please select a role');
      return;
    }

    setLoading(true);

    const { confirmPassword, ...userData } = formData;
    const result = await register(userData);
    
    if (result.success) {
      navigate(dashboardPaths[result.user?.role] || '/', { replace: true });
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="rv-kicker">RentalVerify</span>
        <h2>Create your account</h2>
        <p className="auth-subtitle">Join a trusted marketplace for verified rentals.</p>
        
        {error && <div className="auth-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>Full name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Abeitu Kebede"
            />
          </div>
          
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="your@email.com"
            />
          </div>
          
          <div className="auth-field">
            <label>Phone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="09XX-XXXXXX"
            />
          </div>

          {formData.role === 'landlord' && (
            <div className="auth-field">
              <label>📷 Landlord photo URL (optional)</label>
              <input
                type="url"
                name="profilePhoto"
                value={formData.profilePhoto}
                onChange={handleChange}
                placeholder="https://example.com/photo.jpg"
              />
            </div>
          )}
          
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="••••••••"
            />
          </div>
          
          <div className="auth-field">
            <label>Confirm password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="••••••••"
            />
          </div>
          
          <div className="auth-field">
            <label>Role *</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
            >
              <option value="" disabled>Select a role</option>
              <option value="tenant">Tenant</option>
              <option value="landlord">Landlord</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="auth-submit"
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        
        <p className="auth-footer">
          Already have an account? <Link to="/login">Login</Link>
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
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '450px',
  },
  title: {
    textAlign: 'center',
    marginBottom: '30px',
    color: '#2d3748',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontWeight: '600',
    color: '#2d3748',
    fontSize: '14px',
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    fontSize: '16px',
    transition: 'border-color 0.2s',
  },
  button: {
    padding: '12px',
    backgroundColor: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px',
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

export default Register;