import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FaArrowLeft, FaComments, FaPaperPlane, FaSearch } from 'react-icons/fa';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BackToDashboard from '../components/BackToDashboard';
import BackToPreviousPage from '../components/BackToPreviousPage';
import './messages.css';

const nameOf = (user) => user?.name || user?.email || 'Area Admin';
const initialOf = (user) => nameOf(user).charAt(0).toUpperCase();
const timeOf = (date) => date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
const dayLabel = (date) => {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (value.toDateString() === today.toDateString()) return 'Today';
  if (value.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return value.toLocaleDateString();
};

const SupportMessages = ({ role }) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const baseUrl = `${process.env.REACT_APP_API_URL}/api/messages`;
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  const back = role === 'tenant' ? <BackToDashboard /> : <BackToPreviousPage />;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${baseUrl}/support/conversations`, { headers: headers() });
      const records = Array.isArray(response.data) ? response.data : [];
      setConversations(records);
      if (conversationId) {
        const selected = records.find((item) => item._id === conversationId);
        if (!selected) {
          setError('Conversation not found.');
          setConversation(null);
        } else {
          const detail = await axios.get(`${baseUrl}/conversations/${conversationId}`, { headers: headers() });
          setConversation(detail.data);
        }
      } else setConversation(null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || requestError.message || 'Unable to load support messages.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, conversationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation]);

  const startConversation = async () => {
    setOpening(true);
    setError('');
    try {
      const response = await axios.post(`${baseUrl}/support/conversations/open`, {}, { headers: headers() });
      setConversation(response.data);
      setConversations((current) => [response.data, ...current.filter((item) => item._id !== response.data._id)]);
      setSearchParams({ conversationId: response.data._id });
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || requestError.message || 'No Area Admin is assigned to your area yet.');
    } finally {
      setOpening(false);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!conversation || !body.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await axios.post(`${baseUrl}/conversations/${conversation._id}/messages`, { body }, { headers: headers() });
      setConversation(response.data);
      setConversations((current) => current.map((item) => item._id === response.data._id ? response.data : item));
      setBody('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || requestError.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const filtered = conversations.filter((item) => {
    const admin = item.admin || {};
    return `${admin.name || ''} ${admin.email || ''}`.toLowerCase().includes(search.toLowerCase());
  });
  const admin = conversation?.admin || {};

  return (
    <div className="messages-page messages-support-page">
      {back}
      <header className="messages-page-header">
        <div><h1>Messages</h1><p>Support conversation with your Area Admin</p></div>
      </header>
      {error && <div className="messages-error messages-page-error">{error}</div>}
      <main className="messages-shell">
        <aside className={`messages-sidebar ${conversation ? 'messages-sidebar-hidden-mobile' : ''}`}>
          <div className="messages-sidebar-header"><h2>Conversations</h2>{!conversation && <button type="button" className="messages-new-button" onClick={startConversation} disabled={opening}>+ New</button>}</div>
          <label className="messages-search"><FaSearch aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /></label>
          {loading ? <div className="messages-skeleton-list">{[1, 2, 3].map((item) => <div className="messages-skeleton" key={item} />)}</div> : (
            <div className="messages-conversation-list">
              {!filtered.length && <p className="messages-empty-list">No conversations yet</p>}
              {filtered.map((item) => {
                const last = item.messages?.[item.messages.length - 1];
                const unread = last && String(last.sender?._id || last.sender) !== String(user?.id);
                return <button type="button" className={`messages-conversation-item ${conversation?._id === item._id ? 'is-active' : ''}`} key={item._id} onClick={() => setSearchParams({ conversationId: item._id })}>
                  <span className="messages-avatar">{initialOf(item.admin)}</span><span className="messages-conversation-copy"><span className="messages-conversation-top"><strong>{nameOf(item.admin)}</strong><time>{timeOf(last?.sentAt)}</time></span><span className="messages-conversation-meta">Area Admin · {item.admin?.email || ''}</span><span className="messages-preview">{last?.body || 'No messages yet'}</span></span>{unread && <span className="messages-unread-badge">New</span>}
                </button>;
              })}
            </div>
          )}
        </aside>
        <section className={`messages-thread ${conversation ? 'messages-thread-visible-mobile' : ''}`}>
          {!conversation ? <div className="messages-thread-empty"><FaComments /><h2>Select a conversation or start a new one</h2><button type="button" className="messages-modal-send" onClick={startConversation} disabled={opening}>{opening ? 'Opening...' : 'Message Area Admin'}</button></div> : (
            <>
              <header className="messages-thread-header"><button type="button" className="messages-mobile-back" onClick={() => setConversation(null)}><FaArrowLeft /></button><span className="messages-avatar">{initialOf(admin)}</span><div><h2>{nameOf(admin)}</h2><p><span>Area Admin</span> {admin.email}</p></div></header>
              <div className="messages-thread-body">{!conversation.messages?.length && <p className="messages-empty-thread">Start a conversation with your Area Admin.</p>}{conversation.messages?.map((message, index) => { const own = String(message.sender?._id || message.sender) === String(user?.id); const separator = index === 0 || dayLabel(conversation.messages[index - 1].sentAt) !== dayLabel(message.sentAt); return <React.Fragment key={message._id}>{separator && <div className="messages-date-separator">{dayLabel(message.sentAt)}</div>}<div className={`messages-bubble-row ${own ? 'is-own' : ''}`}><div className="messages-bubble"><p>{message.body}</p><time>{timeOf(message.sentAt)}</time></div></div></React.Fragment>; })}<div ref={endRef} /></div>
              <form className="messages-composer" onSubmit={sendMessage}><textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={handleKeyDown} placeholder="Write a message..." rows="1" disabled={sending} /><button type="submit" disabled={sending || !body.trim()}><FaPaperPlane />{sending ? 'Sending...' : 'Send'}</button></form>
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default SupportMessages;
