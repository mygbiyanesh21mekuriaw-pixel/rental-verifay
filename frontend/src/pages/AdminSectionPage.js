import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import './adminDashboard.css';

const sectionConfig = {
  rentalRequests: { title: '📋 Rental requests', endpoint: 'rental-requests' },
  awaitingVerification: { title: '⏳ Properties awaiting verification', endpoint: 'pending-properties' },
  allProperties: { title: '📊 All properties', status: 'all' },
  pending: { title: '⏳ Pending properties', status: 'pending' },
  rejected: { title: '❌ Rejected properties', status: 'rejected' },
  allUsers: { title: '👤 All users', endpoint: 'users' },
  verified: { title: '✅ Verified properties', status: 'approved' },
};

const displayVerificationStatus = (property) => {
  if (property.isVerified && property.verificationStatus === 'approved') return 'Verified';
  if (!property.isVerified && property.verificationStatus === 'rejected') return 'Rejected';
  if (!property.isVerified && property.verificationStatus === 'pending') return 'Under Review';
  return property.verificationStatus || 'Unknown';
};

const displayRentalRequestStatus = (status) => (
  status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'
);

const AdminSectionPage = ({ type }) => {
  const navigate = useNavigate();
  const config = sectionConfig[type];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      let endpoint = config.endpoint
        ? `http://localhost:5000/api/admin/${config.endpoint}`
        : `http://localhost:5000/api/admin/properties?status=${config.status}`;

      if (type === 'rentalRequests' || type === 'open') {
        endpoint = 'http://localhost:5000/api/admin/rental-requests?status=pending';
      }

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const records = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.properties) ? response.data.properties : [];
      setItems(records.filter(property => property && property._id != null));
    } catch (error) {
      console.error('Error fetching admin section:', error);
      setItems([]);
      setLoadError(error.response?.data?.message || 'Unable to load admin records.');
    } finally {
      setLoading(false);
    }
  }, [config, type]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handlePropertyAction = async (propertyId, action) => {
    setActionLoading(propertyId);
    const endpoint = `http://localhost:5000/api/admin/${action}-property/${propertyId}`;
    const payload = action === 'reject' ? { comment: 'Documentation insufficient' } : {};
    console.info('Admin property action', { method: 'PUT', endpoint, propertyId, payload });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } });
      console.info('Admin property action succeeded', { method: 'PUT', endpoint, propertyId, status: response.status });
      await fetchItems();
    } catch (error) {
      const status = error.response?.status || 'no response';
      const message = error.response?.data?.message || error.message || 'Unable to update property';
      console.error('Admin property action failed', { method: 'PUT', endpoint, propertyId, payload, status, message });
      alert(`${message} (HTTP ${status})`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRentalRequestAction = async (requestId, action) => {
    setActionLoading(requestId);
    const endpoint = `http://localhost:5000/api/admin/rental-requests/${requestId}/status`;
    const payload = { status: action };
    console.info('Admin rental request action', { method: 'PUT', endpoint, requestId, payload });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } });
      console.info('Admin rental request action succeeded', { method: 'PUT', endpoint, requestId, status: response.status });
      await fetchItems();
    } catch (error) {
      const status = error.response?.status || 'no response';
      const message = error.response?.data?.message || error.message || 'Unable to update rental request';
      console.error('Admin rental request action failed', { method: 'PUT', endpoint, requestId, payload, status, message });
      alert(`${message} (HTTP ${status})`);
    } finally {
      setActionLoading(null);
    }
  };

  if (!config) return null;

  return (
    <div className="admin-container admin-section-page">
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">{config.title}</span>
            </h1>
            <p className="admin-subtitle">Admin management</p>
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
          <div className="admin-loading-small">⏳ Loading...</div>
        ) : loadError ? (
          <div className="admin-empty-text">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="admin-empty-text">No records found.</div>
        ) : type === 'allUsers' ? (
          <div className="admin-grid">
            {items.map(user => (
              <div key={user._id} className="admin-card">
                <h4 className="admin-card-title">👤 {user.name}</h4>
                <p className="admin-card-detail">📧 {user.email}</p>
                <p className="admin-card-detail">🎯 Role: {user.role}</p>
                <p className="admin-card-detail">📱 {user.phone || 'No phone provided'}</p>
              </div>
            ))}
          </div>
        ) : type === 'rentalRequests' || type === 'open' ? (
          <div className="admin-rent-grid">
            {items.map(request => (
              <div key={request._id} className="admin-rent-card">
                <div className="admin-rent-header">
                  <span className="admin-rent-status" data-status={request.status}>{displayRentalRequestStatus(request.status)}</span>
                  <span className="admin-rent-date">{request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'No date'}</span>
                </div>
                
                {request.property?.images?.[0] && (
                  <img src={request.property.images[0]} alt={request.property.title} className="admin-card-image" />
                )}
                
                <h4 className="admin-rent-property">🏠 {request.property?.title || 'Property unavailable'}</h4>
                <p className="admin-rent-location">📍 {request.property?.address || request.property?.location || 'Location unavailable'}</p>
                
                <div className="admin-rent-details">
                  {request.property?.price && (
                    <p><strong>💰 Rent:</strong> ETB {Number(request.property.price).toLocaleString()}</p>
                  )}
                  {request.property?.bedrooms && (
                    <p><strong>🛏 Bedrooms:</strong> {request.property.bedrooms}</p>
                  )}
                  {request.landlord?.name && (
                    <p><strong>👤 Landlord:</strong> {request.landlord.name}</p>
                  )}
                  <p><strong>👤 Tenant:</strong> {request.tenantName || request.tenant?.name || 'Unknown'}</p>
                  <p><strong>📧 Email:</strong> {request.tenantEmail || request.tenant?.email || 'Not available'}</p>
                  {request.moveInDate && (
                    <p><strong>📅 Move-in date:</strong> {new Date(request.moveInDate).toLocaleDateString()}</p>
                  )}
                  {request.message && (
                    <p><strong>📝 Message:</strong> {request.message}</p>
                  )}
                </div>
                
                <div className="admin-card-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    onClick={() => navigate(`/admin-dashboard/rental-requests/${request._id}`)}
                  >
                    👁️ View Details
                  </button>
                  {request.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRentalRequestAction(request._id, 'approved')}
                        disabled={actionLoading === request._id}
                        className="admin-btn admin-btn-approve"
                      >
                        {actionLoading === request._id ? 'Working...' : '✅ Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRentalRequestAction(request._id, 'rejected')}
                        disabled={actionLoading === request._id}
                        className="admin-btn admin-btn-reject"
                      >
                        {actionLoading === request._id ? 'Working...' : '❌ Reject'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-grid">
            {items.map(property => (
              <div key={property._id} className="admin-card">
                {property.images?.[0] && <img src={property.images[0]} alt={property.title} className="admin-card-image" />}
                <h4 className="admin-card-title">{property.title}</h4>
                <p className="admin-card-detail">📍 {property.location}</p>
                <p className="admin-card-price">💰 ETB {Number(property.price).toLocaleString()}</p>
                <p className="admin-card-detail">🚪 Bedrooms: {property.bedrooms}</p>
                <p className="admin-card-detail">👤 Landlord: {property.landlord?.name || 'Unknown Owner'}</p>
                <p className="admin-card-detail">📝 {property.description || 'No description provided'}</p>
                <p className="admin-card-detail">📅 Submitted: {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : 'Date unavailable'}</p>
                <p className="admin-card-detail">
                  📌 Status: {displayVerificationStatus(property)}
                </p>
                {property.verificationDocument && (
                  <div className="admin-card-detail">
                    <strong>📄 Proof of Ownership</strong>
                    <img
                      src={property.verificationDocument}
                      alt={`Proof of ownership for ${property.title}`}
                      className="admin-card-image"
                    />
                  </div>
                )}
                {(type === 'awaitingVerification' || type === 'allProperties') && (
                  <div className="admin-card-actions">
                    <button
                      type="button"
                      onClick={() => handlePropertyAction(property._id, 'verify')}
                      disabled={actionLoading === property._id}
                      className="admin-btn admin-btn-approve"
                    >
                      {actionLoading === property._id ? 'Working...' : '✅ Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePropertyAction(property._id, 'reject')}
                      disabled={actionLoading === property._id}
                      className="admin-btn admin-btn-reject"
                    >
                      {actionLoading === property._id ? 'Working...' : '❌ Reject'}
                    </button>
                  </div>
                )}
                {type !== 'awaitingVerification' && property._id && (
                  <Link to={`/property/${property._id}`} className="admin-card-link">👁️ View details</Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminSectionPage;
