import React, { useEffect, useState } from 'react';
import axios from 'axios';

const LandlordNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (notificationId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://localhost:5000/api/notifications/${notificationId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((current) => current.map((notification) => (
        notification._id === notificationId ? { ...notification, read: true } : notification
      )));
    } catch (error) {
      console.error('Unable to mark landlord notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put('http://localhost:5000/api/notifications/read-all', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    } catch (error) {
      console.error('Unable to mark all landlord notifications as read:', error);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchNotifications();
  }, []);

  return (
    <div className="tenant-container">
      <div className="tenant-header">
        <h1 className="tenant-title">🔔 Notifications</h1>
      </div>

      {loading ? (
        <div className="tenant-loading">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="tenant-empty">
          <span className="tenant-empty-icon">🔔</span>
          <p>No notifications yet.</p>
        </div>
      ) : (
        <section className="tenant-notifications-full">
          <div className="tenant-section-header">
            <h2 className="tenant-section-title">All Notifications</h2>
            <div>
              <span className="tenant-notification-count">{unreadCount} unread</span>
              {unreadCount > 0 && (
                <button type="button" className="tenant-notification-read-btn" onClick={handleMarkAllRead}>
                  Mark all as read
                </button>
              )}
            </div>
          </div>
          {notifications.map((notification) => (
            <article key={notification._id} className={`tenant-notification-item ${notification.type || 'info'} ${notification.read ? 'read' : 'unread'}`}>
              <div className="tenant-notification-header">
                <div>
                  <strong>{notification.propertyTitle || 'Property'}</strong>
                  <small>{new Date(notification.createdAt).toLocaleString()}</small>
                </div>
                {!notification.read && (
                  <button type="button" className="tenant-notification-read-btn" onClick={() => handleMarkRead(notification._id)}>
                    Mark as read
                  </button>
                )}
              </div>
              <p className="tenant-notification-message">{notification.message}</p>
              {notification.instructions && <p className="tenant-notification-message tenant-notification-instructions">{notification.instructions}</p>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
};

export default LandlordNotifications;
