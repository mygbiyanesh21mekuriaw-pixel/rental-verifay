import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import BackToDashboard from '../components/BackToDashboard';
import './TenantDashboard.css';

const TenantMessages = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const [conversation, setConversation] = useState(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadConversation = useCallback(async () => {
    if (!conversationId) {
      setError('No conversation selected.');
      setLoading(false);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/api/messages/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversation(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load conversation.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadConversation();
  }, [loadConversation]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `http://localhost:5000/api/messages/conversations/${conversationId}/messages`,
        { body },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setConversation(response.data);
      setBody('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="tenant-loading"><div className="tenant-loading-spinner"></div><span>⏳ Loading...</span></div>;
  if (error) return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">✉️ Messages</h1>
        <BackToDashboard />
      </div>
      <div className="tenant-empty"><p>{error}</p></div>
    </div>
  );

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">✉️ Messages</h1>
        <p className="tenant-subtitle">{conversation.property?.title} · {conversation.property?.location}</p>
        <p className="tenant-subtitle">Landlord: {conversation.landlord?.name}</p>
        <BackToDashboard />
      </div>
      <section className="tenant-section tenant-message-panel">
        <div className="tenant-message-list">
          {conversation.messages?.length === 0 ? <p className="tenant-empty">Start the conversation with your landlord.</p> : conversation.messages.map(message => (
            <div key={message._id} className={`tenant-message ${message.sender === user.id ? 'tenant-message-own' : ''}`}>
              <p>{message.body}</p>
              <small>{new Date(message.sentAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
        <form className="tenant-message-form" onSubmit={sendMessage}>
          <textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Write a message to your landlord" rows="3" />
          <button type="submit" className="tenant-request-message-btn" disabled={sending || !body.trim()}>{sending ? 'Sending...' : 'Send message'}</button>
        </form>
      </section>
    </div>
  );
};

export default TenantMessages;
