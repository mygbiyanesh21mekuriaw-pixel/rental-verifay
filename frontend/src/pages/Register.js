import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const namePattern = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;

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

const validateRegisterForm = ({ name, email, password, confirmPassword, role }) => {
  const nextErrors = {};
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim();

  if (!trimmedName || !namePattern.test(trimmedName)) {
    nextErrors.name = 'Name must contain letters only';
  }

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

  if (!confirmPassword) {
    nextErrors.confirmPassword = 'Please confirm your password';
  } else if (String(confirmPassword) !== String(password)) {
    nextErrors.confirmPassword = 'Passwords do not match';
  }

  if (!role) {
    nextErrors.role = 'Please select a role';
  }

  return nextErrors;
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const { register, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role) {
      navigate(dashboardPaths[user.role] || '/', { replace: true });
    }
  }, [user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    if (fieldErrors[name]) {
      setFieldErrors((current) => ({ ...current, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationErrors = validateRegisterForm(formData);
    setFieldErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
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
        
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label>Full name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              aria-invalid={Boolean(fieldErrors.name)}
              className={fieldErrors.name ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}
              placeholder="Abeitu Kebede"
            />
            {fieldErrors.name && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.name}</p>}
          </div>
          
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              aria-invalid={Boolean(fieldErrors.email)}
              className={fieldErrors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}
              placeholder="your@email.com"
            />
            {fieldErrors.email && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.email}</p>}
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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
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
          
          <div className="auth-field">
            <label>Confirm password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                className={`pr-11 ${fieldErrors.confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}`}
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-700"
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {fieldErrors.confirmPassword && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.confirmPassword}</p>}
          </div>
          
          <div className="auth-field">
            <label>Role *</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
              aria-invalid={Boolean(fieldErrors.role)}
              className={fieldErrors.role ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}
            >
              <option value="" disabled>Select a role</option>
              <option value="tenant">Tenant</option>
              <option value="landlord">Landlord</option>
            </select>
            {fieldErrors.role && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.role}</p>}
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