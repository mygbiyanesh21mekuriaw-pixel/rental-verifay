import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './adminDashboard.css';

const AdminNotifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const records = Array.isArray(response.data) ? response.data : [];
      setNotifications(records.filter((notif) => notif && notif._id != null));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setLoadError('Unable to load notifications right now.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="admin-container admin-section-page">
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">🔔 Notifications</span>
            </h1>
            <p className="admin-subtitle">System notifications and alerts</p>
          </div>
          <button
            type="button"
            className="admin-close-btn admin-back-dashboard"
            onClick={() => navigate('/admin-dashboard')}
          >
            ← Back to Admin Dashboard
          </button>
        </div>
      </div>

      <section className="admin-detail-section admin-dedicated-content">
        {loading ? (
          <div className="admin-loading-small">⏳ Loading notifications...</div>
        ) : loadError ? (
          <div className="admin-empty-text">{loadError}</div>
        ) : notifications.length === 0 ? (
          <div className="admin-empty-text">No notifications yet.</div>
        ) : (
          <div className="admin-notification-list">
            {notifications.map((notif) => (
              <div key={notif._id} className="admin-notification-item">
                <div className="admin-notification-header">
                  <span className="admin-notification-type">
                    {notif.type === 'approved' ? '✅' : notif.type === 'rejected' ? '❌' : '🔔'} {notif.type || 'Notification'}
                  </span>
                  <span className="admin-notification-date">
                    {notif.createdAt ? new Date(notif.createdAt).toLocaleString() : 'Date unavailable'}
                  </span>
                </div>
                <p className="admin-notification-message">{notif.message || 'No message'}</p>
                {notif.tenant && (
                  <p className="admin-notification-recipient">
                    👤 To: {notif.tenant.name || 'Unknown'} ({notif.tenant.email || 'No email'})
                  </p>
                )}
                {notif.property && (
                  <p className="admin-notification-property">
                    🏠 Property: {notif.property.title || 'Unknown Property'}
                  </p>
                )}
                {notif.read !== undefined && (
                  <p className="admin-notification-property">{notif.read ? '✅ Read' : '🔵 Unread'}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminNotifications;
