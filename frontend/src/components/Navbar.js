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
  const [menuOpen, setMenuOpen] = useState(false);

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

  const closeMenu = () => setMenuOpen(false);

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
      : [
          ['⚙️', 'Dashboard', '/admin-dashboard'],
          ['🏠', 'Properties', '/admin-dashboard/all-properties'],
          ['✅', 'Pending Verification', '/admin-dashboard/pending'],
          ['📝', 'Rental Requests', '/admin-dashboard/rental-requests'],
          ['👥', 'Users', '/admin-dashboard/all-users'],
          ['🔔', 'Notifications', '/admin-dashboard/notifications'],
          ['📊', 'Analytics', '/admin-dashboard/analytics'],
          ['❌', 'Rejected', '/admin-dashboard/rejected'],
          ['💬', 'Messages', '/admin-dashboard/messages'],
          ['✅', 'Verification Properties', '/admin-dashboard/verified'],
          ['📋', 'System Logs', '/admin-dashboard/system-logs'],
        ];

  return (
    <nav className={`navbar ${user ? 'navbar-authenticated' : ''} ${menuOpen ? 'menu-open' : ''}`}>
      <div className="navbar-container">
        {user && (
          <button
            type="button"
            className="navbar-mobile-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {menuOpen ? '×' : '☰'}
          </button>
        )}
        {/* ===== ሎጎ ===== */}
        <Link to="/" className="navbar-logo" onClick={closeMenu}>
          <span className="navbar-logo-icon">🏠</span>
          <span className="navbar-logo-text">RentalVerify</span>
        </Link>

        {/* ===== ሊንኮች ===== */}
        <div className="navbar-links">
          {!user && (
            <>
              <Link 
                to="/" 
                className={`navbar-link ${location.pathname === '/' ? 'active' : ''}`}
                onClick={closeMenu}
              >
                🏠 Home
              </Link>

              <Link 
                to="/about" 
                className={`navbar-link ${location.pathname === '/about' ? 'active' : ''}`}
                onClick={closeMenu}
              >
                ℹ️ About Us
              </Link>
              
              <Link 
                to="/contact" 
                className={`navbar-link ${location.pathname === '/contact' ? 'active' : ''}`}
                onClick={closeMenu}
              >
                📞 Contact Us
              </Link>

              <Link 
                to="/login" 
                className={`navbar-link ${location.pathname === '/login' ? 'active' : ''}`}
                onClick={closeMenu}
              >
                🔐 Login
              </Link>
              <Link 
                to="/register" 
                className="navbar-link navbar-register-btn"
                onClick={closeMenu}
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
                    return (
                      <Link
                        key={path}
                        to={path}
                        className={`navbar-link ${location.pathname === path ? 'active' : ''}`}
                        onClick={closeMenu}
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