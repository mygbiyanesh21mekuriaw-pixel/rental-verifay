import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://localhost:5000/api/notifications/unread-count', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUnreadCount(Number(response.data?.count || 0));
      } catch (error) {
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getInitial = (name) => {
    return name?.charAt(0).toUpperCase() || '?';
  };

  const getRoleName = (role) => {
    const roles = {
      landlord: '🏠 Landlord',
      admin: '⚙️ Admin',
      tenant: '👤 Tenant',
    };
    return roles[role] || role;
  };

  const getRoleClass = (role) => {
    return `navbar-user-role ${role}`;
  };

  if (user?.role === 'landlord') {
    return null;
  }

  const isPlatformAdmin = user?.role === 'admin' && user?.adminType === 'platform';
  const isAreaAdmin = user?.role === 'admin' && user?.adminType === 'area';

  const sidebarLinks = user?.role === 'tenant'
    ? [
        ['📊', 'Dashboard', '/tenant-dashboard'],
        ['✅', 'Verified Properties', '/tenant/verified-properties'],
        ['❤️', 'Favorites', '/tenant/favorites'],
        ['📝', 'Rental Requests', '/tenant/rental-requests'],
        ['🏠', 'Rented Property', '/tenant/rented-property'],
        ['🔎', 'Search Properties', '/tenant/search'],
      ]
    : user?.role === 'landlord'
      ? []
      : isPlatformAdmin
        ? [
            ['⚙️', 'Dashboard', '/admin-dashboard'],
            ['🛡️', 'Admin Management', '/admin-dashboard/admin-management'],
            ['📋', 'System Logs', '/admin-dashboard/system-logs'],
            ['📊', 'Admin Analytics', '/admin-dashboard/analytics'],
            ['👤', 'Users', '/admin-dashboard/all-users'],
            ['💳', 'Payment Period', '/admin-dashboard/payment-period'],
            ['🔔', 'Notifications', '/admin-dashboard/notifications'],
            ['👤', 'Profile', '/admin-dashboard'],
            ['🚪', 'Logout', 'logout'],
          ]
        : isAreaAdmin
          ? [
              ['🏠', 'Dashboard', '/admin-dashboard'],
              ['🏠', 'Properties', '/admin-dashboard/all-properties'],
              ['✅', 'Verified Properties', '/admin-dashboard/verified'],
              ['❌', 'Rejected', '/admin-dashboard/rejected'],
              ['📋', 'Rental Requests', '/admin-dashboard/rental-requests'],
              ['🔎', 'Under Review', '/admin-dashboard/pending'],
              ['🔔', 'Notifications', '/admin-dashboard/notifications'],
              ['🚪', 'Logout', 'logout'],
            ]
          : [
              ['⚙️', 'Dashboard', '/admin-dashboard'],
              ['🏠', 'Properties', '/admin-dashboard/all-properties'],
              ['🔔', 'Notifications', '/admin-dashboard/notifications'],
              ['👤', 'Profile', '/admin-dashboard'],
              ['🚪', 'Logout', 'logout'],
            ];

  return (
    <nav className={`navbar ${user ? 'navbar-authenticated' : ''}`}>
      <div className="navbar-container">
        {/* ===== ሎጎ ===== */}
        <Link to="/" className="navbar-logo">
          <img
            src="/mekdela-amba-logo.jpeg"
            alt="Mekdela Amba University logo"
            className="navbar-logo-image"
          />
          <span className="navbar-logo-text">House Rental Management System</span>
        </Link>

        {/* ===== ሊንኮች ===== */}
        <div className="navbar-links">
          {!user && (
            <>
              <Link 
                to="/" 
                className={`navbar-link ${location.pathname === '/' ? 'active' : ''}`}
              >
                🏠 Home
              </Link>

              <Link 
                to="/about" 
                className={`navbar-link ${location.pathname === '/about' ? 'active' : ''}`}
              >
                ℹ️ About Us
              </Link>
              
              <Link 
                to="/contact" 
                className={`navbar-link ${location.pathname === '/contact' ? 'active' : ''}`}
              >
                📞 Contact Us
              </Link>

              <Link 
                to="/login" 
                className={`navbar-link ${location.pathname === '/login' ? 'active' : ''}`}
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

          {user && (
            <>
              {user?.role !== 'landlord' && (
                <>
                  <div className="navbar-section-label">Workspace</div>
                  {sidebarLinks.map(([icon, label, path]) => {
                    const isNotificationsItem = label === 'Notifications';
                    const isLogoutItem = path === 'logout';

                    if (isLogoutItem) {
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={handleLogout}
                          className="navbar-link navbar-logout-link"
                        >
                          <span aria-hidden="true">{icon}</span> {label}
                        </button>
                      );
                    }

                    return (
                      <Link
                        key={path}
                        to={path}
                        className={`navbar-link ${location.pathname === path ? 'active' : ''}`}
                      >
                        <span aria-hidden="true">{icon}</span> {label}
                        {isNotificationsItem && unreadCount > 0 && (
                          <span className="navbar-notification-badge">{unreadCount}</span>
                        )}
                      </Link>
                    );
                  })}
                </>
              )}
              
              <div className="navbar-user-info">
                <span className="navbar-user-avatar">
                  {getInitial(user.name)}
                </span>
                <span>
                  {user.name}
                  <span className={getRoleClass(user.role)}>
                    {getRoleName(user.role)}
                  </span>
                </span>
              </div>
              
              <button onClick={handleLogout} className="navbar-logout-btn">
                🚪 Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;