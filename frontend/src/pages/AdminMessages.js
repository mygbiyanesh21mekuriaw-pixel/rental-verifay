import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './adminDashboard.css';

const AdminMessages = () => {
  const navigate = useNavigate();
  const [recipients, setRecipients] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');

  // ===== Fetch All Conversations =====
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        'http://localhost:5000/api/messages/admin/conversations',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const records = Array.isArray(response.data) ? response.data : [];
      const validRecords = records.filter(conv => conv && conv._id != null);
      const users = new Map();
      validRecords.forEach((conversation) => {
        [conversation.tenant, conversation.landlord].forEach((user) => {
          if (user?._id && !users.has(String(user._id))) {
            users.set(String(user._id), { user, conversation });
          }
        });
      });
      setRecipients(Array.from(users.values()));
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setLoadError(error.response?.data?.message || 'Unable to load admin conversations.');
      setRecipients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const selectConversation = (conversation, recipient) => {
    setSelectedConversation(conversation);
    setSelectedRecipient(recipient);
    setBody('');
    setSendError('');
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!selectedConversation || !selectedRecipient || !body.trim() || sending) return;

    setSending(true);
    setSendError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `http://localhost:5000/api/messages/admin/conversations/${selectedConversation._id}/messages`,
        { body, recipientId: selectedRecipient._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedConversation(response.data);
      setRecipients(current => current.map(target => (
        target.conversation._id === response.data._id
          ? { ...target, conversation: response.data }
          : target
      )));
      setBody('');
    } catch (error) {
      setSendError(error.response?.data?.message || 'Unable to send reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-container admin-section-page">
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">💬 Messages</span>
            </h1>
            <p className="admin-subtitle">Admin communication with users</p>
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
          <div className="admin-loading-small">⏳ Loading conversations...</div>
        ) : loadError ? (
          <div className="admin-empty-text">{loadError}</div>
        ) : recipients.length === 0 ? (
          <div className="admin-empty-text">No conversations at this time.</div>
        ) : (
          <div className="admin-recipient-list">
            {recipients.map(({ user, conversation }) => (
              <div key={user._id} className="admin-recipient-item">
                <div>
                  <h4 className="admin-conversation-title">👤 {user.name || 'User'}</h4>
                  <p className="admin-recipient-email">{user.email || 'Email unavailable'}</p>
                </div>
                <button
                  type="button"
                  className="admin-message-reply-button"
                  onClick={() => selectConversation(conversation, user)}
                >
                  💬 Reply Message
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedConversation && (
          <div className="admin-message-reply-panel">
            <div className="admin-conversation-header">
              <h2 className="admin-conversation-title">
                💬 Reply to {selectedRecipient?.name || 'selected user'}
              </h2>
              <button
                type="button"
                className="admin-message-close-button"
                onClick={() => {
                  setSelectedConversation(null);
                  setSelectedRecipient(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="admin-message-history">
              {selectedConversation.messages?.filter(message => {
                const senderId = String(message.sender?._id || message.sender);
                const recipientId = message.recipient?._id || message.recipient;
                return String(senderId) === String(selectedRecipient?._id)
                  || String(recipientId) === String(selectedRecipient?._id);
              }).length ? selectedConversation.messages.filter(message => {
                const senderId = String(message.sender?._id || message.sender);
                const recipientId = message.recipient?._id || message.recipient;
                return String(senderId) === String(selectedRecipient?._id)
                  || String(recipientId) === String(selectedRecipient?._id);
              }).map((message) => {
                const senderId = String(message.sender?._id || message.sender);
                const senderName = senderId === String(selectedConversation.tenant?._id)
                  ? selectedConversation.tenant?.name || 'Tenant'
                  : senderId === String(selectedConversation.landlord?._id)
                    ? selectedConversation.landlord?.name || 'Landlord'
                    : 'Admin';
                return (
                  <div key={message._id} className="admin-message-history-item">
                    <strong>{senderName}</strong>
                    <p>{message.body}</p>
                    <small>{new Date(message.sentAt).toLocaleString()}</small>
                  </div>
                );
              }) : (
                <p className="admin-empty-text">No messages in this conversation yet.</p>
              )}
            </div>
            {sendError && <p className="admin-message-error">{sendError}</p>}
            <form className="admin-message-form" onSubmit={sendReply}>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows="3"
                placeholder="Write a reply to this conversation"
                disabled={sending}
              />
              <button type="submit" className="admin-message-send-button" disabled={sending || !body.trim()}>
                {sending ? 'Sending...' : 'Send Reply'}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminMessages;
