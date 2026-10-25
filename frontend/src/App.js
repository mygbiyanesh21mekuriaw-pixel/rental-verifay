import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import {
  FaAddressCard,
  FaEnvelope,
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaPhone,
  FaTelegramPlane,
} from 'react-icons/fa';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import DashboardLayout, { getDashboardMenuGroups } from './components/DashboardLayout';

// CSS
import './App.css';
import './portal-design.css';

//  (Pages)
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';
import Home from './pages/Home';
import LandlordDashboard, { LandlordLayout } from './pages/LandlordDashboard';
import LandlordSectionPage from './pages/LandlordSectionPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminPlaces from './pages/AdminPlaces';
import AdminSectionPage from './pages/AdminSectionPage';
import AdminNotifications from './pages/AdminNotifications';
import AdminContactMessages from './pages/AdminContactMessages';
import AdminProfile from './pages/AdminProfile';
import AdminMessages from './pages/AdminMessages';
import PropertyDetail from './pages/PropertyDetail';
import TenantDashboard from './pages/TenantDashboard';
import TenantSectionPage from './pages/TenantSectionPage';
import TenantSearch from './pages/TenantSearch';
import TenantNotifications from './pages/TenantNotifications';
import AboutUs from './pages/AboutUs';
import ContactUs from './pages/ContactUs';
import { PrivacyPolicy, TermsOfService } from './pages/LegalPages';
import TenantMessages from './pages/TenantMessages';
import LandlordMessages from './pages/LandlordMessages';
import TenantRentPayment from './pages/TenantRentPayment';
import LandlordPayments from './pages/LandlordPayments';
import LandlordRequests from './pages/LandlordRequests';
import LandlordRequestDetail from './pages/LandlordRequestDetail';
import LandlordNotifications from './pages/LandlordNotifications';
import LandlordProfile from './pages/LandlordProfile';
import LandlordAccountSettings from './pages/LandlordAccountSettings';
import LandlordBankInformation from './pages/LandlordBankInformation';
import LandlordReviews from './pages/LandlordReviews';
import TenantRentalRequestDetail from './pages/TenantRentalRequestDetail';
import AdminSystemLogs from './pages/AdminSystemLogs';
import SystemSettings from './pages/SystemSettings';

//  (Components)
import Navbar from './components/Navbar';
import { LanguageProvider } from './context/LanguageContext';
import { SystemStatusProvider, useSystemStatus } from './context/SystemStatusContext';
import MaintenancePage from './pages/MaintenancePage';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

const RouteMain = ({ children }) => {
  const { pathname } = useLocation();
  const isLandlordRoute = pathname === '/landlord-dashboard' || pathname.startsWith('/landlord/');

  return (
    isLandlordRoute
      ? <div className="landlord-route-container w-full min-w-0 flex-1">{children}</div>
      : <main className="app-main">{children}</main>
  );
};

const DashboardRouteShell = ({ children, maintenanceActive }) => {
  const { user } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const role = user?.role;
  const isDashboardRoute = !maintenanceActive && (
    (role === 'landlord' && (location.pathname === '/landlord-dashboard' || location.pathname.startsWith('/landlord/'))) ||
    (role === 'tenant' && (location.pathname === '/tenant-dashboard' || location.pathname.startsWith('/tenant/'))) ||
    (role === 'admin' && location.pathname.startsWith('/admin-dashboard'))
  );

  if (!isDashboardRoute) {
    return (
      <>
        {(!maintenanceActive || !user) && <Navbar />}
        <ScrollToTop />
        <RouteMain>{children}</RouteMain>
      </>
    );
  }

  const roleTitle = role === 'admin'
    ? t(user.adminType === 'area' ? 'Area Admin' : 'Platform Admin')
    : t(role === 'landlord' ? 'Landlord' : 'Tenant');

  return (
    <DashboardLayout
      header={<Navbar />}
      menuGroups={getDashboardMenuGroups(user, t)}
      user={user}
      title={roleTitle}
    >
      <ScrollToTop />
      <div className="w-full min-w-0">{children}</div>
    </DashboardLayout>
  );
};

const ApplySystemPreferences = () => {
  const { user } = useAuth();

  React.useEffect(() => {
    const preferences = user?.systemPreferences;
    if (!preferences) return;

    document.documentElement.dataset.appearance = preferences.defaultAppearance;
    document.documentElement.style.colorScheme =
      preferences.defaultAppearance === 'system' ? '' : preferences.defaultAppearance;
  }, [user]);

  return null;
};
const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const PrivateRoute = ({ children, allowedRoles, allowedAdminTypes }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <span> Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={dashboardPaths[user.role] || '/'} replace />;
  }

  if (user.role === 'admin' && allowedAdminTypes && !allowedAdminTypes.includes(user.adminType || 'platform')) {
    return <Navigate to={dashboardPaths[user.role] || '/'} replace />;
  }

  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <span> Loading...</span>
      </div>
    );
  }

  if (user) {
    if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
    return <Navigate to={dashboardPaths[user.role] || '/'} replace />;
  }

  return children;
};

const AuthenticatedPublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <span> Loading...</span>
      </div>
    );
  }

  if (user) {
    if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
    return <Navigate to={dashboardPaths[user.role] || '/'} replace />;
  }

  return children;
};

const PublicAliasRoute = ({ target }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <span> Loading...</span>
      </div>
    );
  }

  if (user) {
    if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
    return <Navigate to={dashboardPaths[user.role] || '/'} replace />;
  }

  return <Navigate to={target} replace />;
};

const AppFooter = () => {
  const { pathname } = useLocation();
  const { status } = useSystemStatus();
  const { t } = useLanguage();

  if (pathname === '/login' || pathname === '/register') return null;
  if (!['/', '/about', '/contact', '/login', '/register', '/privacy-policy', '/terms'].includes(pathname)) return null;

  return (
    <footer className="app-footer">
      <div className="app-footer-content">
        <div className="app-footer-brand">
          <span className="app-footer-heading">{t('Project Information')}</span>
          <strong>{status.branding.websiteName}</strong>
          <span>{t('Student Academic Project')}</span>
          <span>{t('Mekdela Amba University')}</span>
          <span>{t('College of Computing and Informatics')}</span>
        </div>
        <nav className="app-footer-links" aria-label={t('Footer navigation')}>
          <span className="app-footer-heading">{t('Quick Links')}</span>
          <Link className="app-footer-link" to="/">{t('Home')}</Link>
          <Link className="app-footer-link" to="/about">{t('About Us')}</Link>
          <Link className="app-footer-link" to="/contact">{t('Contact Us')}</Link>
          <Link className="app-footer-link" to="/login">{t('Login')}</Link>
          <Link className="app-footer-link" to="/register">{t('Register')}</Link>
        </nav>
        <div className="app-footer-contact">
          <span className="app-footer-heading">
            <FaAddressCard className="app-footer-icon" aria-hidden="true" />
            {t('Contact')}
          </span>
          {status.branding.contactEmail ? (
            <a className="app-footer-email" href={`mailto:${status.branding.contactEmail}`}>
              <FaEnvelope className="app-footer-icon" aria-hidden="true" />
              {status.branding.contactEmail}
            </a>
          ) : (
            <a className="app-footer-email" href="mailto:admin@gmail.com">
              <FaEnvelope className="app-footer-icon" aria-hidden="true" />
              admin@gmail.com
            </a>
          )}
          <span className="app-footer-detail">
            <FaPhone className="app-footer-icon" aria-hidden="true" />
            {t('Phone')}: +251 9X XXX XXXX
          </span>
          <span className="app-footer-detail">
            <FaAddressCard className="app-footer-icon" aria-hidden="true" />
            {t('Address')}: Mekdela Amba, Ethiopia
          </span>
        </div>
        <div className="app-footer-legal">
          <span className="app-footer-heading">{t('Legal')}</span>
          <Link className="app-footer-link" to="/privacy-policy">{t('Privacy Policy')}</Link>
          <Link className="app-footer-link" to="/terms">{t('Terms of Service')}</Link>
          <div className="app-footer-socials" role="group" aria-label={t('Social media links')}>
            <a href="https://t.me/#" target="_blank" rel="noopener noreferrer" aria-label={t('Telegram')}>
              <FaTelegramPlane aria-hidden="true" />
            </a>
            <a href="https://facebook.com/#" target="_blank" rel="noopener noreferrer" aria-label={t('Facebook')}>
              <FaFacebookF aria-hidden="true" />
            </a>
            <a href="https://linkedin.com/#" target="_blank" rel="noopener noreferrer" aria-label={t('LinkedIn')}>
              <FaLinkedinIn aria-hidden="true" />
            </a>
            <a href="https://instagram.com/#" target="_blank" rel="noopener noreferrer" aria-label={t('Instagram')}>
              <FaInstagram aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <div className="app-footer-bottom">
        <span>{t('© 2026 House Rental Management System. All Rights Reserved.', { websiteName: status.branding.websiteName })}</span>
      </div>
    </footer>
  );
};

function AppContent() {
  const { user, logout } = useAuth();
  const { status, loading, error } = useSystemStatus();
  const platformAdmin = user?.role === 'admin' &&
    (user.adminType === 'platform' || !user.adminType);

  React.useEffect(() => {
    document.title = status.branding.websiteName;
  }, [status.branding.websiteName]);

  if (loading) {
    return <div className="app-loading" role="status">Loading application settings…</div>;
  }

  if (error) {
    return <div className="app-loading" role="alert">{error}</div>;
  }

  const maintenanceActive = status.maintenance.enabled && !platformAdmin;

  return (
    <div className="app">
      <Router>
        <ApplySystemPreferences />
        <DashboardRouteShell maintenanceActive={maintenanceActive}>
          {maintenanceActive ? (
            user && !user.mustChangePassword ? (
              <MaintenancePage message={status.maintenance.message} onLogout={logout} />
            ) : (
              <Routes>
                <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
                <Route path="/change-password" element={<PrivateRoute><ChangePassword /></PrivateRoute>} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<MaintenancePage message={status.maintenance.message} />} />
              </Routes>
            )
          ) : (
          <Routes>
            {/* =====    ===== */}
            <Route path="/" element={<AuthenticatedPublicRoute><Home /></AuthenticatedPublicRoute>} />
            <Route path="/search" element={<Navigate to="/tenant/verified-properties" replace />} />
            <Route path="/property/:id" element={<PropertyDetail />} />
            <Route path="/about" element={<AuthenticatedPublicRoute><AboutUs /></AuthenticatedPublicRoute>} />
            <Route path="/about-us" element={<PublicAliasRoute target="/about" />} />
            <Route path="/contact" element={<AuthenticatedPublicRoute><ContactUs /></AuthenticatedPublicRoute>} />
            <Route path="/contact-us" element={<PublicAliasRoute target="/contact" />} />
            <Route path="/privacy-policy" element={<AuthenticatedPublicRoute><PrivacyPolicy /></AuthenticatedPublicRoute>} />
            <Route path="/terms" element={<AuthenticatedPublicRoute><TermsOfService /></AuthenticatedPublicRoute>} />
            <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
            <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/change-password" element={<PrivateRoute><ChangePassword /></PrivateRoute>} />

            <Route 
              path="/landlord/add-property" 
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordDashboard initialShowForm={true} />
                  </LandlordLayout>
                </PrivateRoute>
              } 
            />
            <Route
              path="/landlord/edit-property/:propertyId"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordDashboard />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            
            {/* ===== Tenant  ===== */}
            <Route 
              path="/tenant-dashboard"
              element={
                <PrivateRoute allowedRoles={['tenant']}>
                  <TenantDashboard />
                </PrivateRoute>
              } 
            />
            <Route path="/tenant/verified-properties" element={<PrivateRoute allowedRoles={['tenant']}><TenantSectionPage type="verified" /></PrivateRoute>} />
            <Route path="/tenant/favorites" element={<PrivateRoute allowedRoles={['tenant']}><TenantSectionPage type="favorites" /></PrivateRoute>} />
            <Route path="/tenant/recently-viewed" element={<PrivateRoute allowedRoles={['tenant']}><TenantSectionPage type="recentlyViewed" /></PrivateRoute>} />
            <Route path="/tenant/rental-requests" element={<PrivateRoute allowedRoles={['tenant']}><TenantSectionPage type="rentalRequests" /></PrivateRoute>} />
            <Route path="/tenant/rented-property" element={<PrivateRoute allowedRoles={['tenant']}><TenantSectionPage type="rented" /></PrivateRoute>} />
            <Route path="/tenant/search" element={<PrivateRoute allowedRoles={['tenant']}><TenantSearch /></PrivateRoute>} />
            <Route path="/tenant/notifications" element={<PrivateRoute allowedRoles={['tenant']}><TenantNotifications /></PrivateRoute>} />
            <Route path="/tenant/account-settings" element={<PrivateRoute allowedRoles={['tenant']}><LandlordAccountSettings /></PrivateRoute>} />
            <Route path="/tenant/rental-requests/:requestId" element={<PrivateRoute allowedRoles={['tenant']}><TenantRentalRequestDetail /></PrivateRoute>} />
            <Route path="/tenant/messages" element={<PrivateRoute allowedRoles={['tenant']}><TenantMessages /></PrivateRoute>} />
            <Route path="/tenant/rent-payment/:propertyId" element={<PrivateRoute allowedRoles={['tenant']}><TenantRentPayment /></PrivateRoute>} />
            <Route path="/landlord/messages" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordMessages /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/notifications" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordNotifications /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/profile" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordProfile /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/account-settings" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordAccountSettings /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/bank-information" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordBankInformation /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/rent-payments" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordPayments /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/rental-requests" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordRequests /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/rental-requests/:requestId" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordRequestDetail /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/reviews" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordReviews /></LandlordLayout></PrivateRoute>} />
            
            {/* ===== Landlord  ===== */}
            <Route 
              path="/landlord-dashboard"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordDashboard />
                  </LandlordLayout>
                </PrivateRoute>
              } 
            />
            <Route
              path="/landlord/my-properties"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordSectionPage type="myProperties" />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/landlord/verified-properties"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordSectionPage type="verified" />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/landlord/under-review"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordSectionPage type="underReview" />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/landlord/under-review-properties"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordSectionPage type="underReview" />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/landlord/rejected"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordSectionPage type="rejected" />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/landlord/rejected-properties"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordSectionPage type="rejected" />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/landlord/rented-properties"
              element={
                <PrivateRoute allowedRoles={['landlord']}>
                  <LandlordLayout>
                    <LandlordSectionPage type="rented" />
                  </LandlordLayout>
                </PrivateRoute>
              }
            />
            
            {/* ===== Admin  ===== */}
            <Route 
              path="/admin-dashboard"
              element={
                <PrivateRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </PrivateRoute>
              } 
            />
            <Route path="/admin-dashboard/analytics" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform']}><AdminAnalytics /></PrivateRoute>} />
            <Route path="/admin-dashboard/pending" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['area']}><AdminSectionPage type="pending" /></PrivateRoute>} />
            <Route path="/admin-dashboard/rental-requests" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminSectionPage type="rentalRequests" /></PrivateRoute>} />
            <Route path="/admin-dashboard/verified" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminSectionPage type="verified" /></PrivateRoute>} />
            <Route path="/admin-dashboard/rejected" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminSectionPage type="rejected" /></PrivateRoute>} />
            <Route path="/admin-dashboard/notifications" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminNotifications /></PrivateRoute>} />
            <Route path="/admin-dashboard/contact-messages" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminContactMessages /></PrivateRoute>} />
            <Route path="/admin-dashboard/profile" element={<PrivateRoute allowedRoles={['admin']}><AdminProfile /></PrivateRoute>} />
            <Route path="/admin-dashboard/messages" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminMessages /></PrivateRoute>} />
            <Route path="/admin-dashboard/system-logs" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform']}><AdminSystemLogs /></PrivateRoute>} />
            <Route path="/admin-dashboard/system-settings" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform']}><SystemSettings /></PrivateRoute>} />
            <Route path="/admin-dashboard/open" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><Navigate to="/admin-dashboard" replace /></PrivateRoute>} />
            <Route path="/admin-dashboard/properties-awaiting-verification" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['area']}><AdminSectionPage type="awaitingVerification" /></PrivateRoute>} />
            <Route path="/admin-dashboard/review-properties" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminSectionPage type="reviewProperties" /></PrivateRoute>} />
            <Route path="/admin-dashboard/all-properties" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminSectionPage type="allProperties" /></PrivateRoute>} />
            <Route path="/admin-dashboard/all-users" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform', 'area']}><AdminSectionPage type="allUsers" /></PrivateRoute>} />
            <Route path="/admin-dashboard/admin-management" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform']}><AdminSectionPage type="adminManagement" /></PrivateRoute>} />
            <Route path="/admin-dashboard/places" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform']}><AdminPlaces /></PrivateRoute>} />
            <Route path="/admin-dashboard/payment-period" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform']}><AdminSectionPage type="paymentPeriod" /></PrivateRoute>} />
            <Route path="/admin-dashboard/demo-bank-accounts" element={<PrivateRoute allowedRoles={['admin']} allowedAdminTypes={['platform']}><AdminSectionPage type="demoBankAccounts" /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          )}
        </DashboardRouteShell>
        {!maintenanceActive && <AppFooter />}
      </Router>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <SystemStatusProvider>
        <AppContent />
      </SystemStatusProvider>
    </LanguageProvider>
  );
}

export default App;
