import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './TenantDashboard.css';

const LandlordMessages = () => {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [body, setBody] = useState('');
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('propertyId');

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/messages/conversations', { headers: { Authorization: `Bearer ${token}` } });
      setConversations(response.data);
      setSelected(response.data.find(conversation => String(conversation.property?._id) === String(propertyId)) || null);
    };
    load().catch(() => setConversations([]));
  }, [propertyId]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!body.trim() || !selected) return;
    const token = localStorage.getItem('token');
    const response = await axios.post(`http://localhost:5000/api/messages/conversations/${selected._id}/messages`, { body }, { headers: { Authorization: `Bearer ${token}` } });
    setSelected(response.data);
    setConversations(current => current.map(conversation => conversation._id === response.data._id ? response.data : conversation));
    setBody('');
  };

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">✉️ Messages</h1>
      </div>
      <section className="tenant-section tenant-message-panel">
        {!propertyId && conversations.length === 0 ? <div className="tenant-empty"><p>No conversations yet.</p></div> : null}
        {!propertyId && conversations.map(conversation => (
          <button type="button" className="tenant-message-conversation" key={conversation._id} onClick={() => setSelected(conversation)}>
            {conversation.property?.title} · Tenant: {conversation.tenant?.name}
          </button>
        ))}
        {selected && (
          <>
            <h2 className="tenant-section-title">💬 Reply Message</h2>
            <p className="tenant-subtitle">{selected.property?.title} · {selected.property?.location}</p>
            <div className="tenant-message-list">
              {selected.messages?.map(message => <div key={message._id} className="tenant-message"><p>{message.body}</p><small>{new Date(message.sentAt).toLocaleString()}</small></div>)}
            </div>
            <form className="tenant-message-form" onSubmit={sendMessage}>
              <textarea value={body} onChange={event => setBody(event.target.value)} rows="3" placeholder="Reply to tenant" />
              <button type="submit" className="tenant-request-message-btn" disabled={!body.trim()}>Send message</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
};

export default LandlordMessages;
