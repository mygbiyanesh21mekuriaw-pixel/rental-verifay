import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import BackToDashboard from '../components/BackToDashboard';
import './TenantDashboard.css';

const TenantMessages = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const conversationId = searchParams.get('conversationId');
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadConversation = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = conversationId
        ? `${process.env.REACT_APP_API_URL}/api/messages/conversations/${conversationId}`
        : `${process.env.REACT_APP_API_URL}/api/messages/tenant/conversations`;
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (conversationId) {
        setConversation(response.data);
      } else {
        setConversations(Array.isArray(response.data) ? response.data : []);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load conversation.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadConversation();
  }, [conversationId, loadConversation]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!body.trim() || sending || !conversation) return;
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/messages/conversations/${conversationId}/messages`,
        { body },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setConversation(response.data);
      setConversations((current) =>current.map((item) => (
        item._id === response.data._id ? response.data : item
      )));
      setBody('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-w-0" role="status">
        <p className="m-0 text-sm text-slate-600">Loading...</p>
      </div>
    );
  }
  if (error) return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-bold text-slate-800">Messages</h1>
        <BackToDashboard
          className="!mt-0 max-sm:!w-auto max-sm:!justify-start"
          dashboardRoute={location.state?.from || '/tenant-dashboard'}
          label=" Back to Previous Page"
        />
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>
    </div>
  );

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-bold text-slate-800">Messages</h1>
          {conversation && (
            <div className="mt-2 space-y-1">
              <p className="m-0 break-words text-sm text-slate-600">
                {conversation.property?.title} {conversation.property?.location}
              </p>
              <p className="m-0 text-sm text-slate-600">Landlord: {conversation.landlord?.name}</p>
            </div>
          )}
        </div>
        <BackToDashboard
          className="!mt-0 max-sm:!w-auto max-sm:!justify-start"
          dashboardRoute={location.state?.from || '/tenant-dashboard'}
          label=" Back to Previous Page"
        />
      </div>
      <section className="tenant-message-panel">
        {!conversationId && !conversation && conversations.length === 0 && <p className="tenant-empty">No conversations yet.</p>}
        {!conversationId && !conversation && conversations.map(item => (
          <button type="button" className="tenant-message-conversation" key={item._id} onClick={() =>navigate(`/tenant/messages?conversationId=${item._id}`)}>
            {item.property?.title || 'Property'}  Landlord: {item.landlord?.name || 'Landlord'}
          </button>
        ))}
        {conversation && <>
          <div className="tenant-message-list">
            {conversation.messages?.length === 0 ? <p className="tenant-empty">Start the conversation with your landlord.</p> : conversation.messages.map(message => (
              <div key={message._id} className={`tenant-message ${String(message.sender?._id || message.sender) === String(user?.id) ? 'tenant-message-own' : ''}`}>
                <strong className="tenant-message-sender">
                  {String(message.sender?._id || message.sender) === String(user?.id) ? 'You' : 'Landlord'}
                </strong>
                <p>{message.body}</p>
                <small>{new Date(message.sentAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
          <form className="tenant-message-form" onSubmit={sendMessage}>
            <textarea value={body} onChange={event =>setBody(event.target.value)} placeholder="Write a message to your landlord" rows="3" />
            <button type="submit" className="tenant-request-message-btn" disabled={sending || !body.trim()}>{sending ? 'Sending...' : 'Send message'}</button>
          </form>
        </>}
      </section>
    </div>
  );
};

export default TenantMessages;

