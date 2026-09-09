import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// CSS
import './App.css';
import './portal-design.css';

// ገፆች (Pages)
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import LandlordDashboard, { LandlordLayout } from './pages/LandlordDashboard';
import LandlordSectionPage from './pages/LandlordSectionPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminSectionPage from './pages/AdminSectionPage';
import AdminRentalRequestDetail from './pages/AdminRentalRequestDetail';
import AdminNotifications from './pages/AdminNotifications';
import AdminMessages from './pages/AdminMessages';
import PropertyDetail from './pages/PropertyDetail';
import TenantDashboard from './pages/TenantDashboard';
import TenantSectionPage from './pages/TenantSectionPage';
import TenantSearch from './pages/TenantSearch';
import TenantNotifications from './pages/TenantNotifications';
import AboutUs from './pages/AboutUs';
import ContactUs from './pages/ContactUs';
import TenantMessages from './pages/TenantMessages';
import LandlordMessages from './pages/LandlordMessages';
import TenantRentPayment from './pages/TenantRentPayment';
import LandlordPayments from './pages/LandlordPayments';
import LandlordRequests from './pages/LandlordRequests';
import LandlordRequestDetail from './pages/LandlordRequestDetail';
import LandlordNotifications from './pages/LandlordNotifications';
import LandlordProfile from './pages/LandlordProfile';
import TenantRentalRequestDetail from './pages/TenantRentalRequestDetail';
import AdminSystemLogs from './pages/AdminSystemLogs';

// ክፍሎች (Components)
import Navbar from './components/Navbar';

const dashboardPaths = {
  tenant: '/tenant-dashboard',
  landlord: '/landlord-dashboard',
  admin: '/admin-dashboard',
};

const PrivateRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <span>⏳ Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
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
        <span>⏳ Loading...</span>
      </div>
    );
  }

  if (user) {
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
        <span>⏳ Loading...</span>
      </div>
    );
  }

  if (user) {
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
        <span>⏳ Loading...</span>
      </div>
    );
  }

  if (user) {
    return <Navigate to={dashboardPaths[user.role] || '/'} replace />;
  }

  return <Navigate to={target} replace />;
};

function App() {
  return (
    <div className="app">
      <Router>
        <Navbar />
        <main className="app-main">
          <Routes>
            {/* ===== ለሁሉም የሚገኙ ገፆች ===== */}
            <Route path="/" element={<AuthenticatedPublicRoute><Home /></AuthenticatedPublicRoute>} />
            <Route path="/search" element={<Navigate to="/tenant/verified-properties" replace />} />
            <Route path="/property/:id" element={<PropertyDetail />} />
            <Route path="/about" element={<AuthenticatedPublicRoute><AboutUs /></AuthenticatedPublicRoute>} />
            <Route path="/about-us" element={<PublicAliasRoute target="/about" />} />
            <Route path="/contact" element={<AuthenticatedPublicRoute><ContactUs /></AuthenticatedPublicRoute>} />
            <Route path="/contact-us" element={<PublicAliasRoute target="/contact" />} />
            <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
            <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />

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
            
            {/* ===== Tenant ብቻ ===== */}
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
            <Route path="/tenant/rental-requests/:requestId" element={<PrivateRoute allowedRoles={['tenant']}><TenantRentalRequestDetail /></PrivateRoute>} />
            <Route path="/tenant/messages" element={<PrivateRoute allowedRoles={['tenant']}><TenantMessages /></PrivateRoute>} />
            <Route path="/tenant/rent-payment/:propertyId" element={<PrivateRoute allowedRoles={['tenant']}><TenantRentPayment /></PrivateRoute>} />
            <Route path="/landlord/messages" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordMessages /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/notifications" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordNotifications /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/profile" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordProfile /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/rent-payments" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordPayments /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/rental-requests" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordRequests /></LandlordLayout></PrivateRoute>} />
            <Route path="/landlord/rental-requests/:requestId" element={<PrivateRoute allowedRoles={['landlord']}><LandlordLayout><LandlordRequestDetail /></LandlordLayout></PrivateRoute>} />
            
            {/* ===== Landlord ብቻ ===== */}
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
            
            {/* ===== Admin ብቻ ===== */}
            <Route 
              path="/admin-dashboard"
              element={
                <PrivateRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </PrivateRoute>
              } 
            />
            <Route path="/admin-dashboard/analytics" element={<PrivateRoute allowedRoles={['admin']}><AdminAnalytics /></PrivateRoute>} />
            <Route path="/admin-dashboard/pending" element={<PrivateRoute allowedRoles={['admin']}><AdminSectionPage type="pending" /></PrivateRoute>} />
            <Route path="/admin-dashboard/verified" element={<PrivateRoute allowedRoles={['admin']}><AdminSectionPage type="verified" /></PrivateRoute>} />
            <Route path="/admin-dashboard/rejected" element={<PrivateRoute allowedRoles={['admin']}><AdminSectionPage type="rejected" /></PrivateRoute>} />
            <Route path="/admin-dashboard/rental-requests" element={<PrivateRoute allowedRoles={['admin']}><AdminSectionPage type="rentalRequests" /></PrivateRoute>} />
            <Route path="/admin-dashboard/rental-requests/:requestId" element={<PrivateRoute allowedRoles={['admin']}><AdminRentalRequestDetail /></PrivateRoute>} />
            <Route path="/admin-dashboard/notifications" element={<PrivateRoute allowedRoles={['admin']}><AdminNotifications /></PrivateRoute>} />
            <Route path="/admin-dashboard/messages" element={<PrivateRoute allowedRoles={['admin']}><AdminMessages /></PrivateRoute>} />
            <Route path="/admin-dashboard/system-logs" element={<PrivateRoute allowedRoles={['admin']}><AdminSystemLogs /></PrivateRoute>} />
            <Route path="/admin-dashboard/open" element={<PrivateRoute allowedRoles={['admin']}><Navigate to="/admin-dashboard/rental-requests" replace /></PrivateRoute>} />
            <Route path="/admin-dashboard/properties-awaiting-verification" element={<PrivateRoute allowedRoles={['admin']}><AdminSectionPage type="awaitingVerification" /></PrivateRoute>} />
            <Route path="/admin-dashboard/all-properties" element={<PrivateRoute allowedRoles={['admin']}><AdminSectionPage type="allProperties" /></PrivateRoute>} />
            <Route path="/admin-dashboard/all-users" element={<PrivateRoute allowedRoles={['admin']}><AdminSectionPage type="allUsers" /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        
        {/* ===== የግርጌ (Footer) ===== */}
        <footer className="app-footer">
          <p>
            🏠 Rental Property Verification Portal &copy; 2026
            <br />
            Built by <a href="/about">Internship Project</a>
          </p>
        </footer>
      </Router>
    </div>
  );
}

export default App;