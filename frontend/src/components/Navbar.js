import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  // ==============================
  // UNREAD NOTIFICATIONS
  // ==============================
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        const token = localStorage.getItem('token');

        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/notifications/unread-count`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setUnreadCount(Number(response.data?.unreadCount || 0));
      } catch (error) {
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();
    const refreshInterval = window.setInterval(fetchUnreadCount, 30000);
    return () => window.clearInterval(refreshInterval);
  }, [user, location.pathname]);

  // ==============================
  // LOGOUT
  // ==============================
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    logout();

    window.location.href = '/login';
  };

  // ==============================
  // USER INITIAL
  // ==============================
  const getInitial = (name) => {
    return name?.charAt(0).toUpperCase() || '?';
  };

  // ==============================
  // ROLE NAME
  // ==============================
  const getRoleName = (role) => {
    const roles = {
      landlord: 'ðŸ  Landlord',
      tenant: 'ðŸ‘¤ Tenant',
      admin: 'âš™ï¸ Admin',
    };

    return roles[role] || role;
  };

  // ==============================
  // ROLE CLASS
  // ==============================
  const getRoleClass = (role) => {
    return `navbar-user-role ${role}`;
  };

  // ==============================
  // ADMIN TYPES
  // ==============================
  const isPlatformAdmin =
    user?.role === 'admin' &&
    user?.adminType === 'platform';

  const isAreaAdmin =
    user?.role === 'admin' &&
    user?.adminType === 'area';

  // =========================================================
  // LANDLORD SIDEBAR
  // =========================================================
  const landlordLinks = [
    ['ðŸ“Š', 'Dashboard', '/landlord-dashboard'],

    ['âž•', 'Add House', '/landlord/add-property'],

    ['ðŸ ', 'My Properties', '/landlord/my-properties'],

    ['âœ…', 'Verified Properties', '/landlord/verified-properties'],

    ['ðŸ“„', 'Rental Requests', '/landlord/rental-requests'],

    ['ðŸ˜ï¸', 'Rented Properties', '/landlord/rented-properties'],

    ['â³', 'Under Review', '/landlord/under-review'],

    ['âŒ', 'Rejected', '/landlord/rejected'],

    ['ðŸ’°', 'Rent Payments', '/landlord/rent-payments'],

    ['ðŸ””', 'Notifications', '/landlord/notifications'],

    // PROFILE BUTTON
    ['ðŸ‘¤', 'Profile', '/landlord/profile'],
  ];

  // =========================================================
  // TENANT SIDEBAR
  // =========================================================
  const tenantLinks = [
    ['ðŸ“Š', 'Dashboard', '/tenant-dashboard'],
    ['âœ…', 'Verified Properties', '/tenant/verified-properties'],
    ['â¤ï¸', 'Favorites', '/tenant/favorites'],
    ['ðŸ“', 'Rental Requests', '/tenant/rental-requests'],
    ['ðŸ ', 'Rented Property', '/tenant/rented-property'],
    ['ðŸ”Ž', 'Search Properties', '/tenant/search'],
    ['ðŸ””', 'Notifications', '/tenant/notifications'],
  ];

  // =========================================================
  // PLATFORM ADMIN SIDEBAR
  // =========================================================
  const platformAdminLinks = [
    ['âš™ï¸', 'Dashboard', '/admin-dashboard'],
    ['ðŸ›¡ï¸', 'Admin Management', '/admin-dashboard/admin-management'],
    ['ðŸ“‹', 'System Logs', '/admin-dashboard/system-logs'],
    ['ðŸ“Š', 'Admin Analytics', '/admin-dashboard/analytics'],
    ['ðŸ‘¤', 'Users', '/admin-dashboard/all-users'],
    ['ðŸ’³', 'Payment Period', '/admin-dashboard/payment-period'],
    ['ðŸ””', 'Notifications', '/admin-dashboard/notifications'],
    ['âœ‰ï¸', 'Contact Messages', '/admin-dashboard/contact-messages'],
    ['ðŸ‘¤', 'Profile', '/admin-dashboard/profile'],
  ];

  // =========================================================
  // AREA ADMIN SIDEBAR
  // =========================================================
  const areaAdminLinks = [
    ['ðŸ ', 'Dashboard', '/admin-dashboard'],
    ['ðŸ ', 'Properties', '/admin-dashboard/all-properties'],
    ['âœ…', 'Verified Properties', '/admin-dashboard/verified'],
    ['âŒ', 'Rejected', '/admin-dashboard/rejected'],
    ['ðŸ“‹', 'Rental Requests', '/admin-dashboard/rental-requests'],
    ['ðŸ”Ž', 'Under Review', '/admin-dashboard/pending'],
    ['ðŸ””', 'Notifications', '/admin-dashboard/notifications'],
    ['ðŸ‘¤', 'Profile', '/admin-dashboard/profile'],
  ];

  // =========================================================
  // DEFAULT ADMIN SIDEBAR
  // =========================================================
  const defaultAdminLinks = [
    ['âš™ï¸', 'Dashboard', '/admin-dashboard'],
    ['ðŸ ', 'Properties', '/admin-dashboard/all-properties'],
    ['ðŸ””', 'Notifications', '/admin-dashboard/notifications'],
    ['ðŸ‘¤', 'Profile', '/admin-dashboard/profile'],
  ];

  // =========================================================
  // SELECT LINKS BY USER ROLE
  // =========================================================
  let sidebarLinks = [];

  if (user?.role === 'landlord') {
    sidebarLinks = landlordLinks;
  } else if (user?.role === 'tenant') {
    sidebarLinks = tenantLinks;
  } else if (isPlatformAdmin) {
    sidebarLinks = platformAdminLinks;
  } else if (isAreaAdmin) {
    sidebarLinks = areaAdminLinks;
  } else if (user?.role === 'admin') {
    sidebarLinks = defaultAdminLinks;
  }

  return (
    <>
      {user && (
        <div className="navbar-topbar">
          <button
            type="button"
            onClick={handleLogout}
            className="navbar-top-logout-btn"
          >
            ðŸšª Logout
          </button>
        </div>
      )}

      {/* =====================================================
          NAVBAR
      ===================================================== */}
      <nav
        className={`navbar ${
          user ? 'navbar-authenticated' : ''
        }`}
      >
        <div className="navbar-container">

          {/* =================================================
              LOGO
          ================================================= */}
          <Link to="/" className="navbar-logo">
            <img
              src="/mekdela-amba-logo.jpeg"
              alt="Mekdela Amba University logo"
              className="navbar-logo-image"
            />

            <span className="navbar-logo-text">
              House Rental Management System
            </span>
          </Link>

          {/* =================================================
              NAVIGATION
          ================================================= */}
          <div className="navbar-links">

            {/* =================================================
                PUBLIC NAVIGATION
            ================================================= */}
            {!user && (
              <>
                <Link
                  to="/"
                  className={`navbar-link ${
                    location.pathname === '/'
                      ? 'active'
                      : ''
                  }`}
                >
                  ðŸ  Home
                </Link>

                <Link
                  to="/about"
                  className={`navbar-link ${
                    location.pathname === '/about'
                      ? 'active'
                      : ''
                  }`}
                >
                  â„¹ï¸ About Us
                </Link>

                <Link
                  to="/contact"
                  className={`navbar-link ${
                    location.pathname === '/contact'
                      ? 'active'
                      : ''
                  }`}
                >
                  ðŸ“ž Contact Us
                </Link>

                <Link
                  to="/login"
                  className={`navbar-link ${
                    location.pathname === '/login'
                      ? 'active'
                      : ''
                  }`}
                >
                  ðŸ” Login
                </Link>

                <Link
                  to="/register"
                  className={`navbar-link ${location.pathname === '/register' ? 'active' : ''}`}
                >
                  âœï¸ Register
                </Link>
              </>
            )}

            {/* =================================================
                AUTHENTICATED USER
            ================================================= */}
            {user && (
              <>
                {/* WORKSPACE */}
                <div className="navbar-section-label">
                  Workspace
                </div>

                {/* =================================================
                    SIDEBAR BUTTONS
                ================================================= */}
                {sidebarLinks.map(
                  ([icon, label, path]) => {

                    const isNotificationsItem =
                      label === 'Notifications';

                    const isActive =
                      location.pathname === path ||
                      (
                        path !== '/landlord-dashboard' &&
                        location.pathname.startsWith(
                          `${path}/`
                        )
                      );

                    return (
                      <Link
                        key={path}
                        to={path}
                        className={`navbar-link ${
                          isActive ? 'active' : ''
                        }`}
                      >
                        {/* ICON */}
                        <span aria-hidden="true">
                          {icon}
                        </span>

                        {/* LABEL */}
                        <span>
                          {label}
                        </span>

                        {/* NOTIFICATION COUNT */}
                        {isNotificationsItem &&
                          unreadCount > 0 && (
                            <span className="navbar-notification-badge">
                              {unreadCount}
                            </span>
                          )}
                      </Link>
                    );
                  }
                )}

                {/* =================================================
                    USER INFORMATION
                ================================================= */}
                <div className="navbar-user-info">

                  <span className="navbar-user-avatar">
                    {getInitial(user.name)}
                  </span>

                  <span>
                    {user.name}

                    <span
                      className={getRoleClass(
                        user.role
                      )}
                    >
                      {getRoleName(user.role)}
                    </span>
                  </span>

                </div>
              </>
            )}
          </div>

        </div>
      </nav>
    </>
  );
};

export default Navbar;

