import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  FaCalendarAlt,
  FaArrowRight,
  FaCheckCircle,
  FaBed,
  FaHeart,
  FaMapMarkerAlt,
  FaMoneyBillAlt,
  FaRegHeart,
  FaStar,
  FaUser,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { fetchFavoriteIds, getFavoriteIds, toggleFavorite } from '../utils/favorites';
import BackToDashboard from '../components/BackToDashboard';
import PropertyImage from '../components/PropertyImage';
import { getPropertyImages } from '../utils/propertyMedia';
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

const isApprovedRequest = (request) =>request.status === 'approved' || request.status === 'confirmed';

const isConfirmedRental = (request, userId) => ['approved', 'confirmed'].includes(request.status)
  && request.property?.availabilityStatus === 'rented'
  && String(request.property?.rentedBy) === String(userId);

const isActiveRental = (request, userId) =>isConfirmedRental(request, userId);

const displayRequestStatus = (status, isRented = false) => {
  const normalizedStatus = typeof status === 'string' && status.trim()
    ? status.trim().toLowerCase()
    : 'pending';

  if (isRented && (normalizedStatus === 'approved' || normalizedStatus === 'confirmed')) return 'Rented';
  if (normalizedStatus === 'approved' || normalizedStatus === 'confirmed') return 'Approved';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};

const RentalReview = ({ propertyId }) => {
  const [review, setReview] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('token');
    axios.get(`${process.env.REACT_APP_API_URL}/api/reviews/my/${propertyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((response) => {
      if (active) setReview(response.data.review || null);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || 'Unable to check review status.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [propertyId]);

  const submitReview = async (event) => {
    event.preventDefault();
    if (!rating) {
      setError('Please select a star rating.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/reviews`, {
        propertyId,
        rating,
        comment,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setReview(response.data.review);
      setIsOpen(false);
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Unable to submit your review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="tenant-review-status">Checking review status...</p>;
  if (review) {
    return (
      <div className="tenant-review-saved">
        <strong>Your review</strong>
        <span className="tenant-review-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>
          {Array.from({ length: 5 }, (_, index) => (
            <FaStar
              key={index}
              aria-hidden="true"
              className={index < review.rating ? 'text-amber-400' : 'text-slate-300'}
            />
          ))}
        </span>
        <p>{review.comment}</p>
      </div>
    );
  }

  return (
    <div className="tenant-rental-review">
      {!isOpen && (
        <button type="button" className="tenant-review-open-btn" onClick={() =>setIsOpen(true)}>Write a review
        </button>
      )}
      {isOpen && (
        <form className="tenant-review-form" onSubmit={submitReview}>
          <label className="tenant-review-label">Your rating</label>
          <div className="tenant-review-rating-picker" role="group" aria-label="Select a star rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`tenant-review-star-btn !inline-flex !h-10 !w-10 !items-center !justify-center !rounded-lg !p-0 text-xl transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${rating >= star ? '!text-amber-400' : '!text-slate-300'}`}
                onClick={() => {
                  setRating(star);
                  setError('');
                }}
                aria-label={`${star} star${star === 1 ? '' : 's'}`}
                aria-pressed={rating === star}
              >
                <FaStar aria-hidden="true" />
              </button>
            ))}
          </div>
          <label className="tenant-review-label" htmlFor={`review-${propertyId}`}>Your review</label>
          <textarea
            id={`review-${propertyId}`}
            value={comment}
            onChange={(event) =>setComment(event.target.value)}
            maxLength={2000}
            rows={3}
            required
            placeholder="Share your experience with this property"
          />
          {error && <p className="tenant-review-error" role="alert">{error}</p>}
          <div className="tenant-review-form-actions">
            <button
              type="button"
              className="tenant-review-cancel-btn !inline-flex !h-11 !w-36 !items-center !justify-center !p-0 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              onClick={() => {
                setIsOpen(false);
                setRating(0);
                setComment('');
                setError('');
              }}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tenant-review-submit-btn !inline-flex !h-11 !w-36 !items-center !justify-center !p-0 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              disabled={submitting || !rating || !comment.trim()}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      )}
      {!isOpen && error && <p className="tenant-review-error" role="alert">{error}</p>}
    </div>
  );
};

const sectionConfig = {
  verified: { title: 'Verified properties', empty: 'No verified properties are available yet.' },
  favorites: { title: 'Favorite properties', empty: 'You have no favorite properties yet' },
  recentlyViewed: { title: 'Recently viewed', empty: 'You have not viewed any properties yet' },
  rentalRequests: { title: 'Rental Requests', empty: 'You have not submitted any rental requests yet.' },
  rented: { title: 'Rented Property', empty: 'You do not have an approved rented property yet.' },
};

const PropertyCard = ({
  property,
  userId,
  onFavoriteChange,
  token,
  favoriteIds,
  favoritesReady,
  favoritesError,
  isVerifiedPage = false,
  isFavoritePage = false,
}) => {
  const isFavorite = isFavoritePage || favoriteIds.has(String(property._id));
  const isStyledPropertyCard = isVerifiedPage || isFavoritePage;
  const [isUpdating, setIsUpdating] = useState(false);
  const [favoriteError, setFavoriteError] = useState('');

  const handleFavorite = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsUpdating(true);
    setFavoriteError('');
    try {
      const nextIsFavorite = await toggleFavorite(userId, property._id, token);
      onFavoriteChange?.(property._id, nextIsFavorite);
    } catch (error) {
      setFavoriteError(error.response?.data?.message || error.message || 'Unable to update favorite.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`tenant-card ${isStyledPropertyCard ? 'tenant-verified-card property-card' : ''}`}>
      {isStyledPropertyCard ? (
        <>
          <div className="tenant-verified-card-media">
            <PropertyImage
              src={getPropertyImages(property)}
              alt={property.title}
              className="tenant-card-property-image"
              fallbackClassName="tenant-card-no-image"
              fallbackText="No photo"
            />
            {property.verificationStatus === 'approved' && (
              <span className="tenant-verified-badge">
                <FaCheckCircle aria-hidden="true" />
                Verified
              </span>
            )}
            <button
              type="button"
              className={`tenant-verified-favorite ${isFavorite ? 'active' : ''} ${isFavoritePage ? 'tenant-favorite-remove-button' : ''}`}
              onClick={handleFavorite}
              disabled={isUpdating || !favoritesReady}
              aria-label={isFavoritePage ? 'Remove from favorites' : isFavorite ? 'Favorited' : 'Favorite'}
              aria-busy={!favoritesReady || isUpdating}
              title={isFavoritePage ? 'Remove from favorites' : isFavorite ? 'Favorited' : 'Favorite'}
            >
              {isFavorite
                ? <FaHeart aria-hidden="true" />
                : <FaRegHeart aria-hidden="true" />}
            </button>
          </div>
          <div className="tenant-verified-card-content">
            <h3 className="tenant-verified-card-title" title={property.title}>{property.title}</h3>
            <p className="tenant-verified-card-location">
              <FaMapMarkerAlt aria-hidden="true" />
              <span>{property.location}</span>
            </p>
            <p className="tenant-verified-card-price">
              ETB {property.price?.toLocaleString()}
              <span>/ month</span>
            </p>
            <div className="tenant-verified-card-chips">
              <span className="tenant-verified-card-chip">
                <FaBed aria-hidden="true" />
                {property.bedrooms} {property.bedrooms === 1 ? 'room' : 'rooms'}
              </span>
              <span className="tenant-verified-card-chip">
                <FaUser aria-hidden="true" />
                {property.landlord?.name || 'Not available'}
              </span>
            </div>
            <p className="tenant-verified-card-description">{property.description}</p>
            {property.verificationStatus !== 'approved' && (
              <p className="tenant-verified-card-status">
                Verification status: {property.verificationStatus || 'Unknown'}
              </p>
            )}
            {(favoriteError || favoritesError) && (
              <p className="tenant-favorite-error" role="alert">{favoriteError || favoritesError}</p>
            )}
            <div className="tenant-verified-card-actions">
              <Link to={`/property/${property._id}`} className="tenant-card-btn">
                Request to Rent
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="tenant-card-image">
            <PropertyImage
              src={getPropertyImages(property)}
              alt={property.title}
              className="tenant-card-property-image"
              fallbackClassName="tenant-card-no-image"
              fallbackText="No photo"
            />
            <span className="tenant-card-badge">Verified</span>
          </div>
          <div className="tenant-card-content">
            <h3 className="tenant-card-title">{property.title}</h3>
            <p className="tenant-card-location"> {property.location}</p>
            <p className="tenant-card-price">ETB {property.price?.toLocaleString()}</p>
            <p className="tenant-card-detail"> {property.bedrooms} rooms</p>
            <p className="tenant-card-detail">Landlord: {property.landlord?.name || 'Not available'}</p>
            <p className="tenant-card-description">{property.description}</p>
            <p className="tenant-card-detail">Verification status: Approved</p>
            <div className="tenant-card-actions">
              <button
                type="button"
                className={`tenant-card-action tenant-card-favorite-btn ${isFavorite ? 'active' : ''}`}
                onClick={handleFavorite}
                disabled={isUpdating || !favoritesReady}
              >
                {isUpdating ? 'Saving...' : favoritesError ? 'Favorite unavailable' : !favoritesReady ? 'Loading...' : isFavorite ? 'Favorited' : 'Favorite'}
              </button>
              <Link to={`/property/${property._id}`} className="tenant-card-action tenant-card-btn">Request to Rent</Link>
            </div>
            {(favoriteError || favoritesError) && (
              <p className="tenant-favorite-error" role="alert">{favoriteError || favoritesError}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const RequestList = ({ requests, userId, notifications = [], showActiveRentalActions = false, originPath }) => {
  const navigate = useNavigate();
  const [openingRequestId, setOpeningRequestId] = useState(null);
  const [rentalBadgeNow, setRentalBadgeNow] = useState(Date.now());

  useEffect(() => {
    if (!showActiveRentalActions) return undefined;
    const now = Date.now();
    const nextExpiration = requests
      .filter((request) => request.is_new === true)
      .map((request) => new Date(request.is_new_until).getTime())
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
      .sort((left, right) => left - right)[0];
    if (!nextExpiration) return undefined;

    const timer = window.setTimeout(
      () => setRentalBadgeNow(Date.now()),
      nextExpiration - now + 1,
    );
    return () => window.clearTimeout(timer);
  }, [requests, showActiveRentalActions]);

  const openMessage = async (request) => {
    setOpeningRequestId(request._id);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/messages/conversations/open`, {
        propertyId: request.property?._id,
      }, { headers: { Authorization: `Bearer ${token}` } });
      navigate(`/tenant/messages?conversationId=${response.data._id}`, {
        state: { from: originPath },
      });
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to open messaging.');
    } finally {
      setOpeningRequestId(null);
    }
  };

  return <div className={showActiveRentalActions ? 'tenant-rented-property-list' : 'tenant-request-list'}>
    {requests.map((request) => showActiveRentalActions ? (
      <article key={request._id} className="tenant-rented-property-card">
        {request.is_new === true
          && Number.isFinite(new Date(request.is_new_until).getTime())
          && rentalBadgeNow < new Date(request.is_new_until).getTime() && (
          <span className="tenant-rented-new-badge">New</span>
        )}
        <div className="tenant-rented-hero">
          <div className="tenant-rented-hero-image-wrap">
            <PropertyImage
              className="tenant-rented-hero-image"
              fallbackClassName="tenant-rented-hero-image tenant-rented-image-placeholder"
              src={getPropertyImages(request.property)}
              alt={request.property?.title || 'Rented property'}
              fallbackText="No property photo"
            />
            <span className="tenant-rented-active-badge">
              <FaCheckCircle aria-hidden="true" />
              Active Rental
            </span>
          </div>
          <div className="tenant-rented-hero-content">
            <h2 className="tenant-rented-title">{request.property?.title || 'Rented property'}</h2>
            <p className="tenant-rented-address">
              <FaMapMarkerAlt aria-hidden="true" />
              <span>{[
                request.property?.location,
                request.property?.subCity || request.property?.subcity,
                request.property?.city,
              ].filter(Boolean).join(', ') || 'Location unavailable'}</span>
            </p>
            <p className="tenant-rented-monthly-rent">
              ETB {Number(request.property?.price || 0).toLocaleString()}
              <span>/ month</span>
            </p>
            {isActiveRental(request, userId) && (
              <div className="tenant-rented-success" role="status">
                <FaCheckCircle aria-hidden="true" />
                <span>This property has been rented in your name.</span>
              </div>
            )}
          </div>
        </div>

        <div className="tenant-rented-info-grid">
          <div className="tenant-rented-info-card">
            <span className="tenant-rented-info-icon"><FaUser aria-hidden="true" /></span>
            <div><span>Landlord</span><strong>{request.landlord?.name || 'Not available'}</strong></div>
          </div>
          <div className="tenant-rented-info-card">
            <span className="tenant-rented-info-icon"><FaCalendarAlt aria-hidden="true" /></span>
            <div>
              <span>Move-in date</span>
              <strong>{request.moveInDate ? new Date(request.moveInDate).toLocaleDateString() : 'Not provided'}</strong>
            </div>
          </div>
          <div className="tenant-rented-info-card">
            <span className="tenant-rented-info-icon"><FaCalendarAlt aria-hidden="true" /></span>
            <div>
              <span>Rental started</span>
              <strong>{request.property?.rentedAt ? new Date(request.property.rentedAt).toLocaleDateString() : 'Not provided'}</strong>
            </div>
          </div>
          <div className="tenant-rented-info-card">
            <span className="tenant-rented-info-icon"><FaCheckCircle aria-hidden="true" /></span>
            <div>
              <span>Monthly rent</span>
              <strong>ETB {Number(request.property?.price || 0).toLocaleString()}</strong>
            </div>
          </div>
        </div>

        <div className="tenant-rented-actions">
          {isConfirmedRental(request, userId) && (
            <>
              <button
                type="button"
                className="tenant-rented-pay-btn"
                onClick={() => navigate(`/tenant/rent-payment/${request.property?._id}`, {
                  state: { from: '/tenant/rented-property' },
                })}
              >Pay Rent</button>
              <button
                type="button"
                className="tenant-rented-message-btn"
                onClick={() => openMessage(request)}
                disabled={openingRequestId === request._id}
              >{openingRequestId === request._id ? 'Opening...' : 'Message Landlord'}</button>
              <RentalReview propertyId={request.property?._id} />
            </>
          )}
        </div>
      </article>
    ) : (
      <article
        key={request._id}
        className={`tenant-request-card request-card tenant-request-card-${isApprovedRequest(request) ? 'approved' : String(request.status || 'other').toLowerCase()}`}
      >
        <div className="tenant-request-header">
          <div className="tenant-request-heading">
            <h3 className="tenant-request-title">{request.property?.title}</h3>
            <p className="tenant-request-address tenant-request-detail">
              <FaMapMarkerAlt aria-hidden="true" />
              <span>{request.property?.location}</span>
            </p>
          </div>
          {!showActiveRentalActions && (
            <span
              role="status"
              className={`tenant-request-status tenant-request-status-${isApprovedRequest(request) ? 'approved' : String(request.status || 'other').toLowerCase()}`}
            >
              {isApprovedRequest(request) ? 'Approved' : request.status === 'rejected' ? 'Rejected' : ` ${displayRequestStatus(request.status)}`}
            </span>
          )}
        </div>

        <div className="tenant-request-info-grid">
          <div className="tenant-request-info-item">
            <span className="tenant-request-info-label">Rent</span>
            <strong><FaMoneyBillAlt aria-hidden="true" /> ETB {Number(request.property?.price || 0).toLocaleString()}</strong>
          </div>
          <div className="tenant-request-info-item">
            <span className="tenant-request-info-label">Landlord</span>
            <strong><FaUser aria-hidden="true" /> {request.landlord?.name || 'Not available'}</strong>
          </div>
          <div className="tenant-request-info-item">
            <span className="tenant-request-info-label">Move-in date</span>
            <strong>
              <FaCalendarAlt aria-hidden="true" />
              {request.moveInDate ? new Date(request.moveInDate).toLocaleDateString() : 'Not provided'}
            </strong>
          </div>
        </div>

        {!showActiveRentalActions && notifications.find(notification =>String(notification.rentalRequest?._id || notification.rentalRequest) === String(request._id))?.message && (
          <div className={`tenant-rental-notification tenant-rental-notification-${String(request.status || 'other').toLowerCase()}`}>
            {notifications.find(notification =>String(notification.rentalRequest?._id || notification.rentalRequest) === String(request._id)).message}
          </div>
        )}

        <div className="tenant-request-footer">
          {!showActiveRentalActions && request._id && (() => {
            const propertyId = request.property?._id;
            if (!propertyId) return null;
            return (
              <Link
                to={`/property/${propertyId}`}
                state={request.status === 'rejected' ? { fromRejectedRequest: true, property: request.property } : undefined}
                className="tenant-request-details-btn"
              >
                View Details
                <FaArrowRight aria-hidden="true" />
              </Link>
            );
          })()}
        </div>
      </article>
    ))}
  </div>;
};

const TenantSectionPage = ({ type }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rentedPropertyId = searchParams.get('propertyId');
  const [searchTerm] = useState('');
  const [items, setItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState(() => getFavoriteIds(user?.id));
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesError, setFavoritesError] = useState('');
  const config = sectionConfig[type];

  useEffect(() => {
    let isCurrent = true;
    fetchFavoriteIds(localStorage.getItem('token'), user?.id)
      .then((ids) => {
        if (!isCurrent) return;
        setFavoriteIds(ids);
        setFavoritesReady(true);
      })
      .catch((error) => {
        if (!isCurrent) return;
        setFavoritesError(error.response?.data?.message || 'Unable to load saved favorites. Please refresh and try again.');
      });

    return () => {
      isCurrent = false;
    };
  }, [user?.id]);

  const fetchSection = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      if (type === 'rentalRequests' || type === 'rented') {
        const [response, notificationResponse] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_URL}/api/rent-requests/my-requests`, { headers }),
          axios.get(`${process.env.REACT_APP_API_URL}/api/notifications`, { headers }),
        ]);
        const notificationRecords = Array.isArray(notificationResponse.data)
          ? notificationResponse.data
          : notificationResponse.data?.notifications;
        setNotifications(Array.isArray(notificationRecords) ? notificationRecords : []);
        setItems(type === 'rented'
          ? response.data.filter(request =>isActiveRental(request, user.id)
            && (!rentedPropertyId || String(request.property?._id) === rentedPropertyId))
          : response.data);
      } else if (type === 'recentlyViewed') {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/view-history/my-history`, { headers });
        const seenIds = new Set();
        setItems(response.data.map(entry =>entry.property).filter(property => {
          const propertyId = property?._id?.toString();
          if (!isValidProperty(property) || seenIds.has(propertyId)) return false;
          seenIds.add(propertyId);
          return true;
        }));
      } else if (type === 'favorites') {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/favorites`, { headers });
        const favoriteProperties = uniqueProperties(response.data || []);
        setItems(favoriteProperties);
      } else {
        const params = new URLSearchParams({ verified: 'true' });
        if (type === 'verified' && searchTerm.trim()) params.set('search', searchTerm.trim());
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/properties?${params.toString()}`, { headers });
        const verifiedProperties = uniqueProperties(response.data);
        setItems(verifiedProperties);
      }
    } catch (error) {
      console.error('Error fetching tenant section:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [rentedPropertyId, searchTerm, type, user.id]);

  const handleFavoriteChange = (propertyId, isFavorite) => {
    setFavoriteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (isFavorite) nextIds.add(String(propertyId));
      else nextIds.delete(String(propertyId));
      return nextIds;
    });
    if (type === 'favorites' && !isFavorite) {
      setItems(currentItems =>currentItems.filter(property =>property._id !== propertyId));
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchSection();
  }, [fetchSection]);

  if (loading) {
    return <div className="tenant-loading"><div className="tenant-loading-spinner"></div><span>Loading...</span></div>;
  }

  return (
    <div className="tenant-container tenant-section-page !m-0 !w-full !min-w-0 !max-w-none !p-0">
      <BackToDashboard className="!mt-0 !mb-3 !w-fit !max-w-full" />
      <div className="mb-3 min-w-0">
        <h1 className="m-0 text-2xl font-bold text-slate-800">{config.title}</h1>
        <p className="m-0 mt-1 text-slate-500">Welcome, {user?.name}!</p>
      </div>
      <section className="tenant-section">
        {items.length === 0 ? (
          <div className={`tenant-empty${type === 'favorites' ? ' tenant-favorites-empty' : ''}`}>
            {type === 'favorites' ? (
              <FaHeart className="tenant-favorites-empty-icon" aria-hidden="true" />
            ) : (
              <span className="tenant-empty-icon" aria-hidden="true"></span>
            )}
            <p>{config.empty}</p>
            {type === 'favorites' && (
              <Link to="/tenant/verified-properties" className="tenant-rented-browse-btn">
                Browse Verified Properties
              </Link>
            )}
            {type === 'rented' && (
              <Link to="/tenant/verified-properties" className="tenant-rented-browse-btn">Browse Properties</Link>
            )}
          </div>
        ) : type === 'rentalRequests' || type === 'rented' ? (
          <RequestList
            requests={items}
            userId={user.id}
            notifications={notifications}
            showActiveRentalActions={type === 'rented'}
            originPath={`${location.pathname}${location.search}`}
          />
        ) : (
          <div className={`tenant-grid${type === 'verified' ? ' tenant-verified-grid' : ''}${type === 'favorites' ? ' tenant-favorite-grid' : ''}`}>{items.map(property => (
            <PropertyCard 
              key={property._id} 
              property={property} 
              userId={user.id} 
              token={localStorage.getItem('token')}
              favoriteIds={favoriteIds}
              favoritesReady={favoritesReady}
              favoritesError={favoritesError}
              onFavoriteChange={handleFavoriteChange} 
              isVerifiedPage={type === 'verified'}
              isFavoritePage={type === 'favorites'}
            />
          ))}</div>
        )}
      </section>
    </div>
  );
};

export default TenantSectionPage;
