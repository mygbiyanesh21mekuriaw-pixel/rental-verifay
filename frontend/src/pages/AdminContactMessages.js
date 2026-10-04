import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import BackToDashboard from '../components/BackToDashboard';
import './adminDashboard.css';

const AdminContactMessages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/contact/platform-admin/inbox`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load contact messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const markRead = async (messageId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${process.env.REACT_APP_API_URL}/api/contact/platform-admin/inbox/${messageId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages((current) =>current.map((message) => (
        message._id === messageId ? { ...message, read: true } : message
      )));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update this message.');
    }
  };

  return (
    <main className="admin-contact-page">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <header className="admin-contact-header">
        <div>
          <p className="admin-profile-eyebrow">PLATFORM ADMIN</p>
          <h1>Contact Messages</h1>
          <p>Messages submitted through the public Contact Us form.</p>
        </div>
      </header>

      {loading && <p className="admin-contact-state">Loading messages...</p>}
      {!loading && error && <p className="admin-contact-state error" role="alert">{error}</p>}
      {!loading && !error && messages.length === 0 && (
        <p className="admin-contact-state">No contact messages yet.</p>
      )}
      {!loading && !error && messages.length > 0 && (
        <div className="admin-contact-list">
          {messages.map((message) => (
            <article className={`admin-contact-card ${message.read ? 'read' : 'unread'}`} key={message._id}>
              <div className="admin-contact-card-header">
                <div>
                  <h2>{message.subject}</h2>
                  <p>{message.name}  <a href={`mailto:${message.email}`}>{message.email}</a></p>
                </div>
                <div className="admin-contact-card-meta">
                  <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
                  {!message.read && <button type="button" onClick={() =>markRead(message._id)}>Mark read</button>}
                  {message.read && <span>Read</span>}
                </div>
              </div>
              <p className="admin-contact-body">{message.message}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
};

export default AdminContactMessages;


