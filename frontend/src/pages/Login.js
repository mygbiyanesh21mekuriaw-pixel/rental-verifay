import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate, Link } from 'react-router-dom';

const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const normalizeLoginEmail = (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.replace(/@rentalverifay\.com$/i, '@rentalverify.com');
};

const platformAdminEmail = 'platform.admin@rentalverify.com';

// ==========================================
// EYE ICON
// ==========================================
const EyeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    className="h-5 w-5"
  >
    <path
      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    <circle
      cx="12"
      cy="12"
      r="3"
    />
  </svg>
);

// ==========================================
// EYE OFF ICON
// ==========================================
const EyeOffIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    className="h-5 w-5"
  >
    <path
      d="M3 3l18 18"
      strokeLinecap="round"
    />

    <path
      d="M10.6 10.6A2 2 0 0 0 13.4 13.4"
      strokeLinecap="round"
    />

    <path
      d="M9.9 5.3A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-4.6 5.5M6.7 6.7A17.7 17.7 0 0 0 2 12s3.5 7 10 7a11.8 11.8 0 0 0 5.3-1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ==========================================
// VALIDATE LOGIN FORM
// ==========================================
const validateLoginForm = ({ identifier, password }) => {
  const nextErrors = {};
  const normalizedIdentifier = String(identifier || '').trim();

  if (!normalizedIdentifier) {
    nextErrors.identifier = 'Email or username is required';
  }

  if (!password) {
    nextErrors.password = 'Password is required';
  } else if (String(password).length < 6) {
    nextErrors.password =
      'Password must be at least 6 characters';
  }

  return nextErrors;
};

// ==========================================
// LOGIN COMPONENT
// ==========================================
const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ==========================================
  // REDIRECT IF ALREADY LOGGED IN
  // ==========================================
  useEffect(() => {
    if (user?.role) {
      navigate(
        user.mustChangePassword ? '/change-password' : dashboardPaths[user.role] || '/',
        {
          replace: true,
        }
      );
    }
  }, [user, navigate]);

  // ==========================================
  // HANDLE LOGIN
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Clear previous error
    setError('');

    // Validate form
    const validationErrors = validateLoginForm({
      identifier,
      password,
    });

    setFieldErrors(validationErrors);

    // Stop if validation fails
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // Start loading
    setLoading(true);

    try {
      // ========================================
      // CALL AUTH LOGIN
      // ========================================
      const result = await login(
        normalizeLoginEmail(identifier),
        password
      );

      // ========================================
      // SUCCESS
      // ========================================
      if (result?.success) {
        const role = result.user?.role;

        navigate(
          result.user?.mustChangePassword ? '/change-password' : dashboardPaths[role] || '/',
          {
            replace: true,
          }
        );

        return;
      }

      // ========================================
      // LOGIN FAILED
      // ========================================
      setError(
        result?.error ||
          'Login failed. Please check your email or username and password.'
      );
    } catch (loginError) {
      // ========================================
      // UNEXPECTED ERROR
      // ========================================
      console.error(
        'Login error:',
        loginError
      );

      setError(
        loginError?.response?.data?.message ||
          loginError?.response?.data?.error ||
          loginError?.message ||
          'Unable to login. Please check that the server is running.'
      );
    } finally {
      // ========================================
      // ALWAYS STOP LOADING
      // ========================================
      setLoading(false);
    }
  };

  // ==========================================
  // CHECK PLATFORM ADMIN
  // ==========================================
  const isPlatformAdmin =
    normalizeLoginEmail(identifier) ===
    platformAdminEmail;

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="public-page auth-page">

      {/* ========================================
          LOGIN CARD
      ======================================== */}
      <div className="auth-card">

        <img
          src="/mekdela-amba-logo.jpeg"
          alt="Mekdela Amba University logo"
          className="mx-auto mb-4 h-16 w-16 object-contain"
        />

        {/* TITLE */}
        <span className="rv-kicker">House Rental
        </span>

        <h2>Welcome back
        </h2>

        <p className="auth-subtitle">Sign in to manage your verified rental journey.
        </p>

        {location.state?.sessionExpired && (
          <p className="auth-subtitle" role="status">
            Your session expired. Please sign in again to continue your payment.
          </p>
        )}

        {/* ======================================
            GENERAL ERROR
        ====================================== */}
        {error && (
          <div
            className="auth-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* ======================================
            LOGIN FORM
        ====================================== */}
        <form
          onSubmit={handleSubmit}
          className="auth-form"
          noValidate
        >

          {/* ====================================
              EMAIL OR USERNAME
          ==================================== */}
          <div className="auth-field">

            <label htmlFor="login-identifier">Email or Username
            </label>

            <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);

                if (fieldErrors.identifier) {
                  setFieldErrors((current) => ({
                    ...current,
                    identifier: '',
                  }));
                }

                // Clear general error when user types
                if (error) {
                  setError('');
                }
              }}
              required
              autoComplete="username"
              aria-invalid={Boolean(fieldErrors.identifier)}
              className={
                fieldErrors.identifier
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                  : ''
              }
              placeholder="Enter your email or username"
            />

            {fieldErrors.identifier && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {fieldErrors.identifier}
              </p>
            )}

          </div>

          {/* ====================================
              PASSWORD
          ==================================== */}
          <div className="auth-field">

            <label htmlFor="login-password">Password
            </label>

            <div className="relative">

              <input
                id="login-password"
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);

                  if (fieldErrors.password) {
                    setFieldErrors((current) => ({
                      ...current,
                      password: '',
                    }));
                  }

                  // Clear general error when user types
                  if (error) {
                    setError('');
                  }
                }}
                required
                autoComplete="current-password"
                aria-invalid={Boolean(
                  fieldErrors.password
                )}
                className={`auth-password-input pr-11 ${
                  fieldErrors.password
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                    : ''
                }`}
                placeholder=""
              />

              {/* SHOW / HIDE PASSWORD */}
              <button
                type="button"
                aria-label={
                  showPassword
                    ? 'Hide password'
                    : 'Show password'
                }
                onClick={() =>setShowPassword(
                    (current) => !current
                  )
                }
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-700"
              >
                {showPassword ? (
                  <EyeOffIcon />
                ) : (
                  <EyeIcon />
                )}
              </button>

            </div>

            {fieldErrors.password && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {fieldErrors.password}
              </p>
            )}

          </div>

          {/* ====================================
              FORGOT PASSWORD
          ==================================== */}
          {!isPlatformAdmin && (
            <p className="auth-forgot-password">
              <Link to="/forgot-password">Forgot Password?
              </Link>
            </p>
          )}

          {/* ====================================
              LOGIN BUTTON
          ==================================== */}
          <button
            type="submit"
            disabled={loading}
            className="auth-submit"
          >
            {loading
              ? 'Logging in...'
              : 'Login'}
          </button>

        </form>

        {/* ======================================
            REGISTER
        ====================================== */}
        {!isPlatformAdmin && (
          <p className="auth-footer">Don&apos;t have an account?{' '}

            <Link to="/register">Register
            </Link>
          </p>
        )}

      </div>
    </div>
  );
};

export default Login;