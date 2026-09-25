import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import BackToDashboard from '../components/BackToDashboard';
import './TenantDashboard.css';

const TenantNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const records = Array.isArray(response.data) ? response.data : response.data?.notifications;
      setNotifications(Array.isArray(records) ? records : []);
    } catch (error) {
      console.error('Unable to load tenant notifications:', error);
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
      console.error('Unable to mark notification as read:', error);
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
      console.error('Unable to mark all notifications as read:', error);
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
      console.error('Unable to delete tenant notification:', error);
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
    window.scrollTo(0, 0);
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="tenant-container">
      <BackToDashboard />
      
      <div className="tenant-header">
        <h1 className="tenant-title">🔔 Notifications</h1>
        <p className="tenant-subtitle">Welcome, {user?.name}!</p>
      </div>

      {loading && (
        <div className="tenant-loading">
          <div className="tenant-loading-spinner"></div>
          <span>⏳ Loading notifications...</span>
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <section className="tenant-notifications-full" aria-labelledby="tenant-notifications-title">
          <div className="tenant-section-header">
            <h2 id="tenant-notifications-title" className="tenant-section-title">All Notifications</h2>
            <div className="tenant-notification-actions">
              <span className="tenant-notification-count">{unreadCount} unread</span>
              <button type="button" className="tenant-search-btn tenant-search-clear" onClick={handleMarkAllRead} disabled={markingAll}>
                {markingAll ? 'Updating...' : 'Mark all as read'}
              </button>
            </div>
          </div>
          {actionError && <p className="tenant-notification-error" role="alert">{actionError}</p>}
          <div className="tenant-notification-list-full">
            {notifications.map((notification) => (
              <article key={notification._id} className={`tenant-notification-item ${notification.type || 'info'} ${notification.read ? 'read' : 'unread'}`}>
                <div className="tenant-notification-header">
                  <div>
                    <strong className="tenant-notification-property">{notification.propertyTitle || 'Property'}</strong>
                    <small className="tenant-notification-date">
                      {new Date(notification.createdAt).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
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
                <p className="tenant-notification-message">{notification.message}</p>
                {notification.instructions && <p className="tenant-notification-message tenant-notification-instructions">{notification.instructions}</p>}
                {!notification.read && <span className="tenant-notification-unread">New</span>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default TenantNotifications;
