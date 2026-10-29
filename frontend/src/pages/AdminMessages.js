import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { FaArrowLeft, FaComments, FaPaperPlane, FaSearch, FaTimes } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import './messages.css';

const displayName = (user) => user?.name || user?.email || 'User';
const initials = (user) => displayName(user).trim().charAt(0).toUpperCase();
const roleName = (user) => user?.role === 'tenant' ? 'Tenant' : 'Landlord';
const messageTime = (date) => date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
const dayLabel = (date) => {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (value.toDateString() === today.toDateString()) return 'Today';
  if (value.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return value.toLocaleDateString();
};

const AdminMessages = () => {
  const navigate = useNavigate();
  const [recipients, setRecipients] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [body, setBody] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [availableRecipients, setAvailableRecipients] = useState([]);
  const [hasAssignedArea, setHasAssignedArea] = useState(true);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newSending, setNewSending] = useState(false);
  const [newError, setNewError] = useState('');
  const threadEndRef = useRef(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  const baseUrl = `${process.env.REACT_APP_API_URL}/api/messages`;

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await axios.get(`${baseUrl}/admin/conversations`, { headers: headers() });
      const users = new Map();
      (Array.isArray(response.data) ? response.data : [])
        .filter((conversation) => conversation?._id)
        .forEach((conversation) => {
          [conversation.tenant, conversation.landlord].forEach((user) => {
            if (user?._id) users.set(String(user._id), { user, conversation });
          });
        });
      setRecipients(Array.from(users.values()));
    } catch (error) {
      setLoadError(error.response?.data?.error || error.response?.data?.message || error.message || 'Unable to load admin conversations.');
      setRecipients([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const fetchRecipients = useCallback(async () => {
    try {
      const response = await axios.get(`${baseUrl}/admin/recipients`, { headers: headers() });
      setAvailableRecipients(Array.isArray(response.data?.recipients) ? response.data.recipients : []);
      setHasAssignedArea(response.data?.hasAssignedArea !== false);
    } catch (error) {
      setNewError(error.response?.data?.error || error.response?.data?.message || error.message || 'Unable to load message recipients.');
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchConversations();
    fetchRecipients();
  }, [fetchConversations, fetchRecipients]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNewMessageOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

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
      const response = await axios.post(
        `${baseUrl}/admin/conversations/${selectedConversation._id}/messages`,
        { body, recipientId: selectedRecipient._id },
        { headers: headers() },
      );
      setSelectedConversation(response.data);
      setRecipients((current) => current.map((target) => (
        target.conversation._id === response.data._id ? { ...target, conversation: response.data } : target
      )));
      setBody('');
    } catch (error) {
      setSendError(error.response?.data?.error || error.response?.data?.message || error.message || 'Unable to send reply.');
    } finally {
      setSending(false);
    }
  };

  const openNewMessage = () => {
    setNewError('');
    setRecipientSearch('');
    setNewRecipientId('');
    setNewBody('');
    setNewMessageOpen(true);
  };

  const sendNewMessage = async (event) => {
    event.preventDefault();
    if (!newRecipientId || !newBody.trim() || newSending) return;
    setNewSending(true);
    setNewError('');
    try {
      const response = await axios.post(
        `${baseUrl}/admin/conversations/open`,
        { recipientId: newRecipientId, body: newBody },
        { headers: headers() },
      );
      const recipient = availableRecipients.find((user) => String(user._id) === String(newRecipientId));
      setSelectedConversation(response.data);
      setSelectedRecipient(recipient);
      setRecipients((current) => [
        { user: recipient, conversation: response.data },
        ...current.filter(({ user }) => String(user._id) !== String(newRecipientId)),
      ]);
      setNewMessageOpen(false);
    } catch (error) {
      setNewError(error.response?.data?.error || error.response?.data?.message || error.message || 'Unable to start support conversation.');
    } finally {
      setNewSending(false);
    }
  };

  const filteredRecipients = availableRecipients.filter((user) => {
    const search = recipientSearch.trim().toLowerCase();
    return !search || `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(search);
  });
  const filteredConversations = useMemo(() => recipients.filter(({ user }) => (
    `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(conversationSearch.toLowerCase())
  )), [conversationSearch, recipients]);
  const messages = selectedConversation?.messages || [];
  const adminId = selectedConversation?.admin?._id || selectedConversation?.admin;

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="messages-page">
      <header className="messages-page-header">
        <div>
          <h1>Messages</h1>
          <p>Admin communication with users</p>
        </div>
        <button type="button" className="messages-back-dashboard" onClick={() => navigate('/admin-dashboard')}>Back to dashboard</button>
      </header>
      <main className="messages-shell">
        <aside className={`messages-sidebar ${selectedConversation ? 'messages-sidebar-hidden-mobile' : ''}`}>
          <div className="messages-sidebar-header">
            <h2>Conversations</h2>
            <button type="button" className="messages-new-button" onClick={openNewMessage}>+ New</button>
          </div>
          <label className="messages-search">
            <FaSearch aria-hidden="true" />
            <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search conversations" />
          </label>
          {loading ? (
            <div className="messages-skeleton-list">{[1, 2, 3].map((item) => <div className="messages-skeleton" key={item} />)}</div>
          ) : loadError ? <p className="messages-error">{loadError}</p> : (
            <div className="messages-conversation-list">
              {filteredConversations.length === 0 && <p className="messages-empty-list">No conversations yet</p>}
              {filteredConversations.map(({ user, conversation }) => {
                const last = conversation.messages?.[conversation.messages.length - 1];
                const unread = last && String(last.sender?._id || last.sender) !== String(adminId);
                return (
                  <button
                    type="button"
                    className={`messages-conversation-item ${selectedConversation?._id === conversation._id ? 'is-active' : ''}`}
                    key={user._id}
                    onClick={() => selectConversation(conversation, user)}
                  >
                    <span className="messages-avatar">{initials(user)}</span>
                    <span className="messages-conversation-copy">
                      <span className="messages-conversation-top"><strong>{displayName(user)}</strong><time>{messageTime(last?.sentAt)}</time></span>
                      <span className="messages-conversation-meta">{roleName(user)} · {user.email}</span>
                      <span className="messages-preview">{last?.body || 'No messages yet'}</span>
                    </span>
                    {unread && <span className="messages-unread-badge">New</span>}
                  </button>
                );
              })}
            </div>
          )}
        </aside>
        <section className={`messages-thread ${selectedConversation ? 'messages-thread-visible-mobile' : ''}`}>
          {!selectedConversation ? (
            <div className="messages-thread-empty"><FaComments /><h2>Select a conversation or start a new one</h2></div>
          ) : (
            <>
              <header className="messages-thread-header">
                <button type="button" className="messages-mobile-back" onClick={() => setSelectedConversation(null)}><FaArrowLeft /></button>
                <span className="messages-avatar">{initials(selectedRecipient)}</span>
                <div><h2>{displayName(selectedRecipient)}</h2><p><span>{roleName(selectedRecipient)}</span> {selectedRecipient?.email}</p></div>
              </header>
              <div className="messages-thread-body">
                {messages.length === 0 && <p className="messages-empty-thread">No messages in this conversation yet.</p>}
                {messages.map((message, index) => {
                  const senderId = message.sender?._id || message.sender;
                  const own = String(senderId) === String(adminId);
                  const separator = index === 0 || dayLabel(messages[index - 1].sentAt) !== dayLabel(message.sentAt);
                  return <React.Fragment key={message._id}>{separator && <div className="messages-date-separator">{dayLabel(message.sentAt)}</div>}<div className={`messages-bubble-row ${own ? 'is-own' : ''}`}><div className="messages-bubble"><p>{message.body}</p><time>{messageTime(message.sentAt)}</time></div></div></React.Fragment>;
                })}
                <div ref={threadEndRef} />
              </div>
              <form className="messages-composer" onSubmit={sendReply}>
                {sendError && <p className="messages-error">{sendError}</p>}
                <textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Write a message..." rows="1" disabled={sending} />
                <button type="submit" disabled={sending || !body.trim()} aria-label="Send message"><FaPaperPlane />{sending ? 'Sending...' : 'Send'}</button>
              </form>
            </>
          )}
        </section>
      </main>
      {newMessageOpen && (
        <div className="messages-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setNewMessageOpen(false)}>
          <div className="messages-modal" role="dialog" aria-modal="true" aria-labelledby="new-message-title">
            <div className="messages-modal-header"><h2 id="new-message-title">New Message</h2><button type="button" onClick={() => setNewMessageOpen(false)} aria-label="Close"><FaTimes /></button></div>
            <form onSubmit={sendNewMessage}>
              <label className="messages-field">Search recipients<input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search name or email" /></label>
              <label className="messages-field">Recipient<select value={newRecipientId} onChange={(event) => setNewRecipientId(event.target.value)} disabled={!hasAssignedArea || !filteredRecipients.length || newSending} required><option value="">Select a recipient</option>{filteredRecipients.map((user) => <option key={user._id} value={user._id}>{displayName(user)} · {roleName(user)} · {user.email}</option>)}</select></label>
              {!hasAssignedArea && <p className="messages-error">No assigned area is configured.</p>}
              {hasAssignedArea && !availableRecipients.length && <p className="messages-empty-list">No tenants or landlords were found in your area.</p>}
              {newError && <p className="messages-error">{newError}</p>}
              <label className="messages-field">Message<textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} maxLength="2000" rows="4" placeholder="Write your message" disabled={newSending || !newRecipientId} /></label>
              <button type="submit" className="messages-modal-send" disabled={newSending || !newRecipientId || !newBody.trim()}>{newSending ? 'Sending...' : 'Send message'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMessages;
