import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import BackToDashboard from '../components/BackToDashboard';
import './TenantDashboard.css';

const AdminNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const records = Array.isArray(response.data) ? response.data : response.data?.notifications;
      setNotifications((Array.isArray(records) ? records : []).filter((notif) => notif && notif._id != null));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setLoadError('Unable to load notifications right now.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMarkRead = async (notificationId) => {
    setActionError('');
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://localhost:5000/api/notifications/${notificationId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((current) => current.map((notification) => (
        notification._id === notificationId ? { ...notification, read: true } : notification
      )));
    } catch (error) {
      console.error('Unable to mark admin notification as read:', error);
      setActionError('Unable to mark the notification as read. Please try again.');
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    setActionError('');
    try {
      const token = localStorage.getItem('token');
      await axios.put('http://localhost:5000/api/notifications/read-all', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    } catch (error) {
      console.error('Unable to mark all admin notifications as read:', error);
      setActionError('Unable to mark all notifications as read. Please try again.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (notificationId) => {
    console.log('DELETE notification ID:', notificationId);
    if (!notificationId) {
      setActionError('Unable to delete the notification because its ID is missing.');
      return;
    }

    setDeletingId(notificationId);
    setActionError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`http://localhost:5000/api/notifications/${notificationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('DELETE response status:', response.status);
      console.log('DELETE response:', response.data);
      setNotifications((current) => current.filter((notification) => notification._id !== notificationId));
    } catch (error) {
      console.error('Unable to delete admin notification:', error);
      console.error('DELETE error status:', error.response?.status);
      console.error('DELETE error response:', error.response?.data);
      setActionError(
        error.response?.data?.message ||
        (error.request ? 'The server did not respond to the delete request.' : error.message) ||
        'Unable to delete the notification.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="tenant-container">
      <BackToDashboard dashboardRoute="/admin-dashboard" />

      <div className="tenant-header">
        <h1 className="tenant-title">🔔 Notifications</h1>
      </div>

      {loading ? (
        <div className="tenant-loading">⏳ Loading notifications...</div>
      ) : loadError ? (
        <div className="tenant-empty">{loadError}</div>
      ) : notifications.length === 0 ? (
        <div className="tenant-empty">
          <span className="tenant-empty-icon">🔔</span>
          <p>No notifications yet.</p>
        </div>
      ) : (
        <section className="tenant-notifications-full">
          <div className="tenant-section-header">
            <h2 className="tenant-section-title">All Notifications</h2>
            <div className="tenant-notification-actions">
              <span className="tenant-notification-count">{unreadCount} unread</span>
              {unreadCount > 0 && (
                <button type="button" className="tenant-notification-read-btn" onClick={handleMarkAllRead} disabled={markingAll}>
                  {markingAll ? 'Updating...' : 'Mark all as read'}
                </button>
              )}
            </div>
          </div>
          {actionError && <p className="tenant-notification-error" role="alert">{actionError}</p>}
          {notifications.map((notification) => (
            <article key={notification._id} className={`tenant-notification-item ${notification.type || 'info'} ${notification.read ? 'read' : 'unread'}`}>
              <div className="tenant-notification-header">
                <div>
                  <strong className="tenant-notification-property">{notification.propertyTitle || 'Property'}</strong>
                  <small className="tenant-notification-date">
                    {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Date unavailable'}
                  </small>
                </div>
                <div className="tenant-notification-actions-row">
                  {!notification.read && (
                    <button type="button" className="tenant-notification-read-btn" onClick={() => handleMarkRead(notification._id)}>
                      Mark as read
                    </button>
                  )}
                  <button type="button" className="notification-delete-btn" onClick={() => handleDelete(notification._id)} disabled={deletingId === notification._id} aria-label="Delete notification" title="Delete notification">
                    {deletingId === notification._id ? '...' : '🗑️'}
                  </button>
                </div>
              </div>
              <p className="tenant-notification-message">{notification.message || 'No message'}</p>
              {notification.instructions && <p className="tenant-notification-message tenant-notification-instructions">{notification.instructions}</p>}
              {!notification.read && <span className="tenant-notification-unread">New</span>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
};

export default AdminNotifications;
