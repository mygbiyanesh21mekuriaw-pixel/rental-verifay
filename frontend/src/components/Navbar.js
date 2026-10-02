import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ProfilePhotoControl from './ProfilePhotoControl';
import ProfileAvatar from './ProfileAvatar';
import './navbar.css';

import {
  FaBars,
  FaHome,
  FaUser,
  FaCog,
  FaChartBar,
  FaPlus,
  FaCheck,
  FaFileAlt,
  FaHardHat,
  FaHourglassHalf,
  FaTimes,
  FaMoneyBill,
  FaBell,
  FaHeart,
  FaSearch,
  FaEdit,
  FaLock,
  FaPhone,
  FaSignOutAlt,
  FaShieldAlt,
  FaClipboardList,
  FaCreditCard,
  FaEnvelope,
} from 'react-icons/fa';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // ==========================================
  // CLOSE MOBILE MENU WHEN PAGE CHANGES
  // ==========================================
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // ==========================================
  // UNREAD NOTIFICATIONS
  // ==========================================
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

        setUnreadCount(
          Number(response.data?.unreadCount || 0)
        );
      } catch (error) {
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();

    const refreshInterval = window.setInterval(
      fetchUnreadCount,
      30000
    );

    return () => {
      window.clearInterval(refreshInterval);
    };
  }, [user, location.pathname]);

  // ==========================================
  // LOGOUT
  // ==========================================
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    logout();

    window.location.href = '/login';
  };

  // ==========================================
  // USER INITIAL
  // ==========================================
  const getInitial = (name) => {
    return name?.charAt(0).toUpperCase() || '?';
  };

  // ==========================================
  // ROLE NAME
  // ==========================================
  const getRoleName = (role) => {
    const roles = {
      landlord: 'Landlord',
      tenant: 'Tenant',
      admin: 'Admin',
    };

    return roles[role] || role;
  };

  // ==========================================
  // ROLE CLASS
  // ==========================================
  const getRoleClass = (role) => {
    return `navbar-user-role ${role}`;
  };

  // ==========================================
  // ADMIN TYPES
  // ==========================================
  const isPlatformAdmin =
    user?.role === 'admin' &&
    user?.adminType === 'platform';

  const isAreaAdmin =
    user?.role === 'admin' &&
    user?.adminType === 'area';

  // ==========================================
  // LANDLORD SIDEBAR
  // ==========================================
  const landlordLinks = [
    [FaChartBar, 'Dashboard', '/landlord-dashboard'],

    [FaPlus, 'Add House', '/landlord/add-property'],

    [FaHome, 'My Properties', '/landlord/my-properties'],

    [
      FaCheck,
      'Verified Properties',
      '/landlord/verified-properties',
    ],

    [
      FaFileAlt,
      'Rental Requests',
      '/landlord/rental-requests',
    ],

    [
      FaHardHat,
      'Rented Properties',
      '/landlord/rented-properties',
    ],

    [
      FaHourglassHalf,
      'Under Review',
      '/landlord/under-review',
    ],

    [FaTimes, 'Rejected', '/landlord/rejected'],

    [
      FaMoneyBill,
      'Rent Payments',
      '/landlord/rent-payments',
    ],

    [
      FaBell,
      'Notifications',
      '/landlord/notifications',
    ],

    [FaCog, 'Account Settings', '/landlord/account-settings'],
    [FaMoneyBill, 'Bank Information', '/landlord/bank-information'],
  ];

  // ==========================================
  // TENANT SIDEBAR
  // ==========================================
  const tenantLinks = [
    [FaChartBar, 'Dashboard', '/tenant-dashboard'],

    [
      FaCheck,
      'Verified Properties',
      '/tenant/verified-properties',
    ],

    [FaHeart, 'Favorites', '/tenant/favorites'],

    [
      FaEdit,
      'Rental Requests',
      '/tenant/rental-requests',
    ],

    [
      FaHome,
      'Rented Property',
      '/tenant/rented-property',
    ],

    [
      FaSearch,
      'Search Properties',
      '/tenant/search',
    ],

    [
      FaBell,
      'Notifications',
      '/tenant/notifications',
    ],
  ];

  // ==========================================
  // PLATFORM ADMIN SIDEBAR
  // ==========================================
  const platformAdminLinks = [
    [
      FaCog,
      'Dashboard',
      '/admin-dashboard',
    ],

    [
      FaShieldAlt,
      'Admin Management',
      '/admin-dashboard/admin-management',
    ],

    [
      FaClipboardList,
      'System Logs',
      '/admin-dashboard/system-logs',
    ],

    [
      FaChartBar,
      'Admin Analytics',
      '/admin-dashboard/analytics',
    ],

    [
      FaUser,
      'Users',
      '/admin-dashboard/all-users',
    ],

    [
      FaCreditCard,
      'Payment Period',
      '/admin-dashboard/payment-period',
    ],

    [
      FaBell,
      'Notifications',
      '/admin-dashboard/notifications',
    ],

    [
      FaEnvelope,
      'Contact Messages',
      '/admin-dashboard/contact-messages',
    ],

    [
      FaUser,
      'Account Settings',
      '/admin-dashboard/profile',
    ],
  ];

  // ==========================================
  // AREA ADMIN SIDEBAR
  // ==========================================
  const areaAdminLinks = [
    [
      FaHome,
      'Dashboard',
      '/admin-dashboard',
    ],

    [
      FaHome,
      'Properties',
      '/admin-dashboard/all-properties',
    ],

    [
      FaCheck,
      'Verified Properties',
      '/admin-dashboard/verified',
    ],

    [
      FaTimes,
      'Rejected',
      '/admin-dashboard/rejected',
    ],

    [
      FaClipboardList,
      'Rental Requests',
      '/admin-dashboard/rental-requests',
    ],

    [
      FaSearch,
      'Under Review',
      '/admin-dashboard/pending',
    ],

    [
      FaBell,
      'Notifications',
      '/admin-dashboard/notifications',
    ],

    [
      FaUser,
      'Account Settings',
      '/admin-dashboard/profile',
    ],
  ];

  // ==========================================
  // DEFAULT ADMIN SIDEBAR
  // ==========================================
  const defaultAdminLinks = [
    [
      FaCog,
      'Dashboard',
      '/admin-dashboard',
    ],

    [
      FaHome,
      'Properties',
      '/admin-dashboard/all-properties',
    ],

    [
      FaBell,
      'Notifications',
      '/admin-dashboard/notifications',
    ],

    [
      FaUser,
      'Account Settings',
      '/admin-dashboard/profile',
    ],
  ];

  // ==========================================
  // SELECT SIDEBAR BASED ON USER ROLE
  // ==========================================
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
      {/* ==========================================
          TOP LOGOUT BAR
      ========================================== */}
      {user && (
        <div className="navbar-topbar">
          <button
            type="button"
            onClick={handleLogout}
            className="navbar-top-logout-btn"
          >
            <FaSignOutAlt aria-hidden="true" />
            <span>Logout</span>
          </button>
          {user.role === 'landlord' ? (
            <Link to="/landlord/profile" className="navbar-top-profile-link" aria-label="Profile">
              <ProfileAvatar user={user} className="navbar-top-profile-avatar" />
              <span>Profile</span>
            </Link>
          ) : (
            <ProfilePhotoControl user={user} className="navbar-top-profile-photo" showLabel />
          )}
        </div>
      )}

      {/* ==========================================
          MAIN NAVBAR
      ========================================== */}
      <nav
        className={`navbar ${
          user ? 'navbar-authenticated' : ''
        } ${
          user?.role === 'landlord'
            ? 'navbar-landlord'
            : ''
        } ${
          !user && location.pathname === '/'
            ? 'navbar-home'
            : ''
        } ${
          !user && ['/', '/about', '/contact', '/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname)
            ? 'navbar-public'
            : ''
        }`}
      >
        <div className="navbar-container">

          {/* ========================================
              LOGO
          ======================================== */}
          <Link
            to="/"
            className="navbar-logo"
          >
            <img
              src="/mekdela-amba-logo.jpeg"
              alt="Mekdela Amba University logo"
              className="navbar-logo-image"
            />

            <span className="navbar-logo-text">
              {user ? (
                <>
                  <span className="navbar-name-desktop">House Rental Management System</span>
                  <span className="navbar-name-mobile">House Rental</span>
                </>
              ) : (
                'House Rental'
              )}
            </span>
          </Link>

          {/* ========================================
              MOBILE HAMBURGER
          ======================================== */}
          <button
            type="button"
            className="navbar-hamburger"
            aria-label={
              menuOpen
                ? 'Close navigation menu'
                : 'Open navigation menu'
            }
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() =>
              setMenuOpen((isOpen) => !isOpen)
            }
          >
            {menuOpen ? (
              <FaTimes aria-hidden="true" />
            ) : (
              <FaBars aria-hidden="true" />
            )}
          </button>

          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="navbar-mobile-header-logout"
            >
              <FaSignOutAlt aria-hidden="true" />
              <span>Logout</span>
            </button>
          )}

          {/* ========================================
              NAVIGATION LINKS
          ======================================== */}
          <div
            id="primary-navigation"
            className={`navbar-links ${
              menuOpen ? 'is-open' : ''
            }`}
            onClick={(event) => {
              if (event.target.closest('a')) {
                setMenuOpen(false);
              }
            }}
          >

            {/* ======================================
                PUBLIC NAVIGATION
            ====================================== */}
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
                  <FaHome aria-hidden="true" />
                  <span>Home</span>
                </Link>

                <Link
                  to="/about"
                  className={`navbar-link ${
                    location.pathname === '/about'
                      ? 'active'
                      : ''
                  }`}
                >
                  <FaUser aria-hidden="true" />
                  <span>About Us</span>
                </Link>

                <Link
                  to="/contact"
                  className={`navbar-link ${
                    location.pathname === '/contact'
                      ? 'active'
                      : ''
                  }`}
                >
                  <FaPhone aria-hidden="true" />
                  <span>Contact Us</span>
                </Link>

                <Link
                  to="/login"
                  className={`navbar-link ${
                    location.pathname === '/login'
                      ? 'active'
                      : ''
                  }`}
                >
                  <FaLock aria-hidden="true" />
                  <span>Login</span>
                </Link>

                <Link
                  to="/register"
                  className={`navbar-link ${
                    location.pathname === '/register'
                      ? 'active'
                      : ''
                  }`}
                >
                  <FaEdit aria-hidden="true" />
                  <span>Register</span>
                </Link>
              </>
            )}

            {/* ======================================
                AUTHENTICATED USER
            ====================================== */}
            {user && (
              <>
                {/* WORKSPACE LABEL */}
                <div className="navbar-section-label">
                  Workspace
                </div>

                {/* SIDEBAR LINKS */}
                {sidebarLinks.map(
                  ([Icon, label, path]) => {
                    const isNotificationsItem =
                      label === 'Notifications';

                    const isActive =
                      location.pathname === path ||
                      (
                        path !==
                          '/landlord-dashboard' &&
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
                        <span
                          aria-hidden="true"
                          className="navbar-icon"
                        >
                          <Icon />
                        </span>

                        {/* LABEL */}
                        <span>
                          {label}
                        </span>

                        {/* NOTIFICATION BADGE */}
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

                {/* ==================================
                    USER INFORMATION
                ================================== */}
                {!(user.role === 'admin' && ['area', 'platform'].includes(user.adminType)) && (
                  <div className="navbar-user-info">
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
                )}

                {/* ==================================
                    MOBILE LOGOUT
                ================================== */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="navbar-mobile-logout"
                >
                  <FaSignOutAlt
                    aria-hidden="true"
                  />
                  <span>Logout</span>
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;