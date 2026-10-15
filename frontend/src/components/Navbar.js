import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ProfilePhotoControl from './ProfilePhotoControl';
import ProfileAvatar from './ProfileAvatar';
import LanguageSwitcher from './LanguageSwitcher';
import { useSystemStatus } from '../context/SystemStatusContext';
import { useLanguage } from '../context/LanguageContext';
import { useDashboardLayout } from './DashboardLayout';
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
  FaBuilding,
  FaTh,
} from 'react-icons/fa';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { status } = useSystemStatus();
  const { t } = useLanguage();
  const location = useLocation();
  const dashboardLayout = useDashboardLayout();
  const setDashboardUnreadCount = dashboardLayout?.setUnreadCount;

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
      setDashboardUnreadCount?.(0);
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

        const count = Number(response.data?.unreadCount ?? response.data?.count ?? 0);
        setUnreadCount(count);
        setDashboardUnreadCount?.(count);
      } catch (error) {
        setUnreadCount(0);
        setDashboardUnreadCount?.(0);
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
  }, [user, location.pathname, setDashboardUnreadCount]);

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

    [FaMoneyBill, 'Bank Information', '/landlord/bank-information'],
    [FaCog, 'Account Settings', '/landlord/account-settings'],
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

    [
      FaCog,
      'Account Settings',
      '/tenant/account-settings',
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
      FaCog,
      'System Settings',
      '/admin-dashboard/system-settings',
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
      FaTh,
      'Dashboard',
      '/admin-dashboard',
    ],

    [
      FaBuilding,
      'Properties',
      '/admin-dashboard/all-properties',
    ],

    [
      FaHourglassHalf,
      'Under Review',
      '/admin-dashboard/pending',
    ],

    [
      FaCheck,
      'Verified',
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

  sidebarLinks = sidebarLinks.filter(([, label]) => label !== 'Notifications');
  const notificationsPath = user?.role === 'admin'
    ? '/admin-dashboard/notifications'
    : user?.role === 'landlord'
      ? '/landlord/notifications'
      : '/tenant/notifications';
  return (
    <>
      {/* ==========================================
          TOP LOGOUT BAR
      ========================================== */}
      {user && (
        <div className={dashboardLayout
          ? 'dashboard-shell-topbar !relative !inset-auto !z-30 !flex !h-[66px] !w-full !items-center !justify-start !gap-2 !border-0 !border-b !border-white/10 !bg-[var(--rv-dashboard-topbar)] !px-3 !py-0 !text-white !shadow-sm md:!h-[78px] md:!gap-5 md:!px-6'
          : 'navbar-topbar'}
        >
          {dashboardLayout && (
            <button
              type="button"
              onClick={dashboardLayout.toggleMenu}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:hidden"
              aria-label={t(dashboardLayout.menuOpen ? 'Close navigation menu' : 'Open navigation menu')}
              aria-expanded={dashboardLayout.menuOpen}
              aria-controls="dashboard-navigation"
            >
              {dashboardLayout.menuOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
            </button>
          )}
          <Link to="/" className="navbar-topbar-brand">
            <img
              src={status.branding.websiteLogoDataUri || '/mekdela-amba-logo.jpeg'}
              alt={`${status.branding.websiteName} logo`}
              className="navbar-topbar-logo"
            />
            <span className="navbar-topbar-brand-copy">
              <strong>{status.branding.websiteName}</strong>
            </span>
          </Link>
          <div className="navbar-topbar-context">
            <span>
              {t(user.role === 'admin'
                ? user.adminType === 'area' ? 'Area Admin' : 'Platform Admin'
                : getRoleName(user.role))}
              {' '}{t('Workspace')}
            </span>
            <strong>{dashboardLayout?.title || t('Overview / Dashboard')}</strong>
          </div>
          <Link
            to={notificationsPath}
            className={`navbar-topbar-notifications${location.pathname === notificationsPath ? ' active' : ''}`}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            title="Notifications"
          >
            <FaBell aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="navbar-topbar-notification-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
          <LanguageSwitcher
            className={`language-switcher-topbar ${dashboardLayout ? '[&_select]:max-md:!w-[76px] [&_select]:max-md:!max-w-[76px]' : ''}`}
          />
          <button
            type="button"
            onClick={handleLogout}
            className={`${dashboardLayout ? 'shrink-0 ' : ''}navbar-top-logout-btn ${dashboardLayout ? '!inline-flex !min-h-10 !items-center !justify-center !gap-2 !rounded-lg !border !border-white/20 !bg-white/10 !px-3 !py-0 !text-white !shadow-none hover:!translate-y-0 hover:!bg-white/20 hover:!shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 max-md:!h-9 max-md:!w-9 max-md:!gap-0 max-md:!p-0' : ''}`}
          >
            <FaSignOutAlt aria-hidden="true" />
            <span className={dashboardLayout ? 'max-md:!hidden' : ''}>Logout</span>
          </button>
          {user.role === 'landlord' ? (
            <Link to="/landlord/profile" className={`navbar-top-profile-link ${dashboardLayout ? '!text-white' : ''}`} aria-label="Profile">
              <ProfileAvatar user={user} className="navbar-top-profile-avatar" />
              <span>Profile</span>
            </Link>
          ) : (
            <ProfilePhotoControl
              user={user}
              className={`navbar-top-profile-photo ${dashboardLayout ? '[&_.profile-photo-control-label]:!text-white' : ''} ${dashboardLayout && user.role === 'tenant' ? '[&_.profile-photo-control-camera]:!h-6 [&_.profile-photo-control-camera]:!w-6 [&_.profile-photo-control-camera]:!text-xs' : ''}`}
              showLabel
            />
          )}
        </div>
      )}

      {/* ==========================================
          MAIN NAVBAR
      ========================================== */}
      {user?.role !== 'landlord' && !dashboardLayout && (
      <nav
        className={`navbar ${
          user ? 'navbar-authenticated' : ''
        } ${
          user?.role === 'landlord'
            ? 'navbar-landlord'
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
              src={status.branding.websiteLogoDataUri || '/mekdela-amba-logo.jpeg'}
              alt={`${status.branding.websiteName} logo`}
              className="navbar-logo-image"
            />

            <span className="navbar-logo-text">
              {status.branding.websiteName}
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
                  className={`navbar-link navbar-link-login ${
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
                  className={`navbar-link navbar-link-register ${
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

            {!user && (
              <LanguageSwitcher className="language-switcher-public" />
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
                          path === '/landlord/bank-information'
                            ? 'navbar-link-bank-information'
                            : ''
                        } ${isActive ? 'active' : ''}`}
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
                              {unreadCount > 99 ? '99+' : unreadCount}
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
      )}
    </>
  );
};

export default Navbar;