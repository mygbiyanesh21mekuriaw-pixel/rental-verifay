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
          'http://localhost:5000/api/notifications/unread-count',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setUnreadCount(Number(response.data?.count || 0));
      } catch (error) {
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();
  }, [user]);

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
      landlord: '🏠 Landlord',
      tenant: '👤 Tenant',
      admin: '⚙️ Admin',
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
    ['📊', 'Dashboard', '/landlord-dashboard'],

    ['➕', 'Add House', '/landlord/add-property'],

    ['🏠', 'My Properties', '/landlord/my-properties'],

    ['✅', 'Verified Properties', '/landlord/verified-properties'],

    ['📄', 'Rental Requests', '/landlord/rental-requests'],

    ['🏘️', 'Rented Properties', '/landlord/rented-properties'],

    ['💰', 'Rent Payments', '/landlord/rent-payments'],

    ['🔔', 'Notifications', '/landlord/notifications'],

    // PROFILE BUTTON
    ['👤', 'Profile', '/landlord/profile'],
  ];

  // =========================================================
  // TENANT SIDEBAR
  // =========================================================
  const tenantLinks = [
    ['📊', 'Dashboard', '/tenant-dashboard'],
    ['✅', 'Verified Properties', '/tenant/verified-properties'],
    ['❤️', 'Favorites', '/tenant/favorites'],
    ['📝', 'Rental Requests', '/tenant/rental-requests'],
    ['🏠', 'Rented Property', '/tenant/rented-property'],
    ['🔎', 'Search Properties', '/tenant/search'],
    ['🔔', 'Notifications', '/tenant/notifications'],
  ];

  // =========================================================
  // PLATFORM ADMIN SIDEBAR
  // =========================================================
  const platformAdminLinks = [
    ['⚙️', 'Dashboard', '/admin-dashboard'],
    ['🛡️', 'Admin Management', '/admin-dashboard/admin-management'],
    ['📋', 'System Logs', '/admin-dashboard/system-logs'],
    ['📊', 'Admin Analytics', '/admin-dashboard/analytics'],
    ['👤', 'Users', '/admin-dashboard/all-users'],
    ['💳', 'Payment Period', '/admin-dashboard/payment-period'],
    ['🔔', 'Notifications', '/admin-dashboard/notifications'],
    ['👤', 'Profile', '/admin-dashboard'],
  ];

  // =========================================================
  // AREA ADMIN SIDEBAR
  // =========================================================
  const areaAdminLinks = [
    ['🏠', 'Dashboard', '/admin-dashboard'],
    ['🏠', 'Properties', '/admin-dashboard/all-properties'],
    ['✅', 'Verified Properties', '/admin-dashboard/verified'],
    ['❌', 'Rejected', '/admin-dashboard/rejected'],
    ['📋', 'Rental Requests', '/admin-dashboard/rental-requests'],
    ['🔎', 'Under Review', '/admin-dashboard/pending'],
    ['🔔', 'Notifications', '/admin-dashboard/notifications'],
  ];

  // =========================================================
  // DEFAULT ADMIN SIDEBAR
  // =========================================================
  const defaultAdminLinks = [
    ['⚙️', 'Dashboard', '/admin-dashboard'],
    ['🏠', 'Properties', '/admin-dashboard/all-properties'],
    ['🔔', 'Notifications', '/admin-dashboard/notifications'],
    ['👤', 'Profile', '/admin-dashboard'],
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
      {/* =====================================================
          TOP LOGOUT BAR
      ===================================================== */}
      {user && (
        <div className="navbar-topbar">
          <button
            type="button"
            onClick={handleLogout}
            className="navbar-top-logout-btn"
          >
            🚪 Logout
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
                  🏠 Home
                </Link>

                <Link
                  to="/about"
                  className={`navbar-link ${
                    location.pathname === '/about'
                      ? 'active'
                      : ''
                  }`}
                >
                  ℹ️ About Us
                </Link>

                <Link
                  to="/contact"
                  className={`navbar-link ${
                    location.pathname === '/contact'
                      ? 'active'
                      : ''
                  }`}
                >
                  📞 Contact Us
                </Link>

                <Link
                  to="/login"
                  className={`navbar-link ${
                    location.pathname === '/login'
                      ? 'active'
                      : ''
                  }`}
                >
                  🔐 Login
                </Link>

                <Link
                  to="/register"
                  className="navbar-link navbar-register-btn"
                >
                  ✍️ Register
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