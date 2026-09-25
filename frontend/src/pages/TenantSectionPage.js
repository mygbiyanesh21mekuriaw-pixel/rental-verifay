import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getFavoriteIds, toggleFavorite } from '../utils/favorites';
import BackToDashboard from '../components/BackToDashboard';
import './TenantDashboard.css';

const isValidProperty = (property) => (
  property?._id &&
  property.landlord?.role === 'landlord' &&
  property.isVerified &&
  property.verificationStatus === 'approved' &&
  property.availabilityStatus !== 'rented' &&
  typeof property.title === 'string' && property.title.trim() &&
  typeof property.description === 'string' && property.description.trim() &&
  typeof property.location === 'string' && property.location.trim() &&
  typeof property.price === 'number' && property.price > 0 &&
  typeof property.bedrooms === 'number' && property.bedrooms >= 0
);

const uniqueProperties = (propertyList) => {
  const seenIds = new Set();
  return propertyList.filter((property) => {
    const propertyId = property?._id?.toString();
    if (!isValidProperty(property) || seenIds.has(propertyId)) return false;
    seenIds.add(propertyId);
    return true;
  });
};

const isApprovedRequest = (request) => request.status === 'approved' || request.status === 'confirmed';

const isConfirmedRental = (request, userId) => ['approved', 'confirmed'].includes(request.status)
  && request.property?.availabilityStatus === 'rented'
  && String(request.property?.rentedBy) === String(userId);

const isActiveRental = (request, userId) => isConfirmedRental(request, userId);

const resolveAssetUrl = (assetPath) => {
  if (!assetPath || /^https?:\/\//i.test(assetPath)) return assetPath;
  return `http://localhost:5000${assetPath.startsWith('/') ? '' : '/'}${assetPath}`;
};

const displayRequestStatus = (status, isRented = false) => {
  const normalizedStatus = typeof status === 'string' && status.trim()
    ? status.trim().toLowerCase()
    : 'pending';

  if (isRented && (normalizedStatus === 'approved' || normalizedStatus === 'confirmed')) return 'Rented';
  if (normalizedStatus === 'approved' || normalizedStatus === 'confirmed') return 'Approved';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};

const sectionConfig = {
  verified: { title: '✅ Verified properties', empty: 'No verified properties are available yet.' },
  favorites: { title: '❤️ Favorite properties', empty: 'You have no favorite properties yet' },
  recentlyViewed: { title: '👁️ Recently viewed', empty: 'You have not viewed any properties yet' },
  rentalRequests: { title: '📝 Rental Requests', empty: 'You have not submitted any rental requests yet.' },
  rented: { title: '🏠 Rented Property', empty: 'You do not have an approved rented property yet.' },
};

const PropertyCard = ({ property, userId, onFavoriteChange, token }) => {
  const [isFavorite, setIsFavorite] = useState(() => getFavoriteIds(userId).has(String(property._id)));
  const [isUpdating, setIsUpdating] = useState(false);

  const handleFavorite = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsUpdating(true);
    try {
      const nextIsFavorite = await toggleFavorite(userId, property._id, token);
      setIsFavorite(nextIsFavorite);
      onFavoriteChange?.(property._id, nextIsFavorite);
    } catch (error) {
      console.error('Error toggling favorite:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
  <div className="tenant-card">
    <div className="tenant-card-image">
      {property.images?.[0] ? <img src={property.images[0]} alt={property.title} /> : <div className="tenant-card-no-image">📸</div>}
      <span className="tenant-card-badge">✅ Verified</span>
    </div>
    <div className="tenant-card-content">
      <h3 className="tenant-card-title">{property.title}</h3>
      <p className="tenant-card-location">📍 {property.location}</p>
      <p className="tenant-card-price">💰 ETB {property.price?.toLocaleString()}</p>
      <p className="tenant-card-detail">🛏️ {property.bedrooms} rooms</p>
      <p className="tenant-card-detail">👤 Landlord: {property.landlord?.name || 'Not available'}</p>
      <p className="tenant-card-description">{property.description}</p>
      <p className="tenant-card-detail">✅ Verification status: Approved</p>
      {property.verificationDocument && (
        <div className="tenant-proof-section">
          <strong>📄 Proof of Ownership</strong>
          <img
            src={resolveAssetUrl(property.verificationDocument)}
            alt={`Proof of ownership for ${property.title}`}
            className="tenant-proof-image"
          />
        </div>
      )}
      <button 
        type="button" 
        className={`tenant-card-favorite-btn ${isFavorite ? 'active' : ''}`} 
        onClick={handleFavorite}
        disabled={isUpdating}
      >
        {isUpdating ? '⏳' : isFavorite ? '❤️ Favorited' : '❤️ Favorite'}
      </button>
      <Link to={`/property/${property._id}`} className="tenant-card-btn">🏠 Request to Rent</Link>
    </div>
  </div>
  );
};

const RequestList = ({ requests, userId, notifications = [], showActiveRentalActions = false }) => {
  const navigate = useNavigate();
  const [openingRequestId, setOpeningRequestId] = useState(null);

  const openMessage = async (request) => {
    setOpeningRequestId(request._id);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:5000/api/messages/conversations/open', {
        propertyId: request.property?._id,
      }, { headers: { Authorization: `Bearer ${token}` } });
      navigate(`/tenant/messages?conversationId=${response.data._id}`);
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to open messaging.');
    } finally {
      setOpeningRequestId(null);
    }
  };

  return <div className="tenant-request-list">
    {requests.map((request) => (
      <div key={request._id} className="tenant-request-card">
        <div>
          {showActiveRentalActions && request.property?.images?.[0] && (
            <img className="tenant-request-image" src={request.property.images[0]} alt={request.property.title || 'Rented property'} />
          )}
          <h3 className="tenant-request-title">🏠 {request.property?.title}</h3>
          <p className="tenant-request-detail">📍 {request.property?.location}</p>
          <p className="tenant-request-detail">💰 Rent: ETB {Number(request.property?.price || 0).toLocaleString()}</p>
          <p className="tenant-request-detail">👤 Landlord: {request.landlord?.name || 'Not available'}</p>
          <p className="tenant-request-detail">📅 Move-in date: {request.moveInDate ? new Date(request.moveInDate).toLocaleDateString() : 'Not provided'}</p>
          {showActiveRentalActions && request.property?.rentedAt && <p className="tenant-request-detail">📅 Rental started: {new Date(request.property.rentedAt).toLocaleDateString()}</p>}
          {request.property?.verificationDocument && (
            <div className="tenant-proof-section">
              <strong>📄 Proof of Ownership</strong>
              <img
                src={resolveAssetUrl(request.property.verificationDocument)}
                alt={`Proof of ownership for ${request.property.title || 'rented property'}`}
                className="tenant-proof-image"
              />
            </div>
          )}
          {isActiveRental(request, userId) && <div className="tenant-rented-notice">🏠 This property has been rented in your name.</div>}
          {!showActiveRentalActions && notifications.find(notification => String(notification.rentalRequest?._id || notification.rentalRequest) === String(request._id))?.message && (
            <div className={`tenant-rental-notification tenant-rental-notification-${request.status}`}>
              {notifications.find(notification => String(notification.rentalRequest?._id || notification.rentalRequest) === String(request._id)).message}
            </div>
          )}
        </div>
        <div className="tenant-request-confirmed-actions">
          <span
            role="status"
            className={`tenant-request-status tenant-request-status-${isApprovedRequest(request) ? 'approved' : request.status}`}
          >
            {isActiveRental(request, userId) && showActiveRentalActions ? '🏠 Rented' : isApprovedRequest(request) ? '✅ Approved' : request.status === 'rejected' ? '❌ Rejected' : `⏳ ${displayRequestStatus(request.status)}`}
          </span>
          {request._id && (() => {
            const propertyId = request.property?._id;
            if (!propertyId) return null;
            return (
              <Link
                to={`/property/${propertyId}`}
                state={request.status === 'rejected' ? { fromRejectedRequest: true, property: request.property } : undefined}
                className="tenant-request-details-btn"
              >
                👁️ View Details
              </Link>
            );
          })()}
          {showActiveRentalActions && isConfirmedRental(request, userId) && (
            <>
              <button type="button" className="tenant-request-message-btn" onClick={() => openMessage(request)} disabled={openingRequestId === request._id}>
                {openingRequestId === request._id ? 'Opening...' : '✉️ Message Landlord'}
              </button>
              <button type="button" className="tenant-request-pay-btn" onClick={() => navigate(`/tenant/rent-payment/${request.property?._id}`)}>
                💳 Pay Rent
              </button>
            </>
          )}
        </div>
      </div>
    ))}
  </div>;
};

const TenantSectionPage = ({ type }) => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const rentedPropertyId = searchParams.get('propertyId');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const config = sectionConfig[type];

  const fetchSection = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      if (type === 'rentalRequests' || type === 'rented') {
        const [response, notificationResponse] = await Promise.all([
          axios.get('http://localhost:5000/api/rent-requests/my-requests', { headers }),
          axios.get('http://localhost:5000/api/notifications', { headers }),
        ]);
        const notificationRecords = Array.isArray(notificationResponse.data)
          ? notificationResponse.data
          : notificationResponse.data?.notifications;
        setNotifications(Array.isArray(notificationRecords) ? notificationRecords : []);
        setItems(type === 'rented'
          ? response.data.filter(request => isActiveRental(request, user.id)
            && (!rentedPropertyId || String(request.property?._id) === rentedPropertyId))
          : response.data);
      } else if (type === 'recentlyViewed') {
        const response = await axios.get('http://localhost:5000/api/view-history/my-history', { headers });
        const seenIds = new Set();
        setItems(response.data.map(entry => entry.property).filter(property => {
          const propertyId = property?._id?.toString();
          if (!isValidProperty(property) || seenIds.has(propertyId)) return false;
          seenIds.add(propertyId);
          return true;
        }));
      } else if (type === 'favorites') {
        const response = await axios.get('http://localhost:5000/api/favorites', { headers });
        const favoriteProperties = uniqueProperties(response.data || []);
        setItems(favoriteProperties);
      } else {
        const params = new URLSearchParams({ verified: 'true' });
        if (type === 'verified' && searchTerm.trim()) params.set('search', searchTerm.trim());
        const response = await axios.get(`http://localhost:5000/api/properties?${params.toString()}`, { headers });
        const verifiedProperties = uniqueProperties(response.data);
        setItems(verifiedProperties);
      }
    } catch (error) {
      console.error('Error fetching tenant section:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, type, user.id]);

  const handleFavoriteChange = (propertyId, isFavorite) => {
    if (type === 'favorites' && !isFavorite) {
      setItems(currentItems => currentItems.filter(property => property._id !== propertyId));
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchSection();
  }, [fetchSection]);

  if (loading) {
    return <div className="tenant-loading"><div className="tenant-loading-spinner"></div><span>⏳ Loading...</span></div>;
  }

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">{config.title}</h1>
        <p className="tenant-subtitle">Welcome, {user?.name}!</p>
        <BackToDashboard />
      </div>
      <section className="tenant-section">
        {items.length === 0 ? (
          <div className="tenant-empty"><span className="tenant-empty-icon">😕</span><p>{config.empty}</p></div>
        ) : type === 'rentalRequests' || type === 'rented' ? (
          <RequestList requests={items} userId={user.id} notifications={notifications} showActiveRentalActions={type === 'rented'} />
        ) : (
          <div className="tenant-grid">{items.map(property => (
            <PropertyCard 
              key={property._id} 
              property={property} 
              userId={user.id} 
              token={localStorage.getItem('token')}
              onFavoriteChange={handleFavoriteChange} 
            />
          ))}</div>
        )}
      </section>
    </div>
  );
};

export default TenantSectionPage;
