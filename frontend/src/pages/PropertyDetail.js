import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  FaBed,
  FaCheckCircle,
  FaEnvelope,
  FaHeart,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaRegHeart,
  FaUser,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import './PropertyDetail.css';
import { getFavoriteIds, toggleFavorite as toggleFavoriteStorage } from '../utils/favorites';
import PropertyImage from '../components/PropertyImage';
import PropertyOwnershipProof from '../components/PropertyOwnershipProof';
import { getPropertyImages } from '../utils/propertyMedia';
import { useLanguage } from '../context/LanguageContext';

const PropertyDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId');
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const adminPropertyListRoutes = [
    '/admin-dashboard/pending',
    '/admin-dashboard/verified',
    '/admin-dashboard/all-properties',
  ];
  const previousAdminPropertyRoute = typeof location.state?.from === 'string'
    && adminPropertyListRoutes.some((route) => (
      location.state.from === route || location.state.from.startsWith(`${route}?`)
    ))
    ? location.state.from
    : null;
  const isAreaAdmin = user?.role === 'admin' && user?.adminType === 'area';
  const backButtonLabel = isAreaAdmin ? '← Back to Previous' : '← Back';
  const [property, setProperty] = useState(null);
  const [selectedImage, setSelectedImage] = useState('');
  const [handlingHistory, setHandlingHistory] = useState([]);
  const [handlingHistoryLoading, setHandlingHistoryLoading] = useState(false);
  const [handlingHistoryError, setHandlingHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // =====    =====
  const [showRentModal, setShowRentModal] = useState(false);
  const [rentMessage, setRentMessage] = useState('');
  const [rentPhone, setRentPhone] = useState(user?.phone || '');
  const [rentMoveInDate, setRentMoveInDate] = useState('');
  const [submittingRent, setSubmittingRent] = useState(false);
  const [rentalMessage, setRentalMessage] = useState('');
  const [rentalRequest, setRentalRequest] = useState(null);

  // =====   =====
  const [isFavorite, setIsFavorite] = useState(false);

  // =====  =====
  const [reviews, setReviews] = useState([]);

  // =====   =====
  const [showContact, setShowContact] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const returnFromPropertyDetails = () => {
    if (!isAreaAdmin) {
      navigate('/search');
      return;
    }

    if (previousAdminPropertyRoute) {
      if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) {
        navigate(-1);
        return;
      }

      navigate(previousAdminPropertyRoute, { state: location.state?.fromState });
      return;
    }

    const fallbackRoute = property?.verificationStatus === 'pending'
      ? '/admin-dashboard/pending'
      : property?.isVerified && property?.verificationStatus === 'approved'
        ? '/admin-dashboard/verified'
        : '/admin-dashboard/all-properties';
    navigate(fallbackRoute);
  };

  // fetchProperty   useCallback 
  const fetchProperty = useCallback(async () => {
    setLoading(true);
    setError('');
    setHandlingHistory([]);
    setHandlingHistoryError('');
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/properties/${id}`,
        { headers }
      );
      setProperty(res.data);
      setRentalRequest(null);

      if (isAreaAdmin) {
        setHandlingHistoryLoading(true);
        try {
          const historyResponse = await axios.get(
            `${process.env.REACT_APP_API_URL}/api/properties/${id}/history`,
            { headers },
          );
          setHandlingHistory(Array.isArray(historyResponse.data) ? historyResponse.data : []);
        } catch (historyError) {
          console.error('Unable to load property handling history:', historyError);
          setHandlingHistoryError('Unable to load history.');
        } finally {
          setHandlingHistoryLoading(false);
        }
      }

      if (requestId && user?.role === 'tenant') {
        const requestResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/rent-requests/my-requests/${requestId}`, { headers });
        if (String(requestResponse.data.property?._id) === String(id)) {
          setRentalRequest(requestResponse.data);
        }
      }

      if (user?.role === 'tenant' && res.data.isVerified) {
        try {
          await axios.post(
            `${process.env.REACT_APP_API_URL}/api/view-history`,
            { propertyId: id },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (historyError) {
          // A history failure must not hide a property that was loaded successfully.
          console.warn('Unable to record property view:', historyError);
        }
      }
    } catch (error) {
      if (error.response?.status === 403 && location.state?.fromRejectedRequest && location.state.property?._id === id) {
        setProperty(location.state.property);
        setRentalRequest(null);
        setError('');
      } else if (error.response?.status === 403) {
        setError('This property has not been verified yet');
      } else if (error.response?.status === 404) {
        setError('Property not found');
      } else {
        setError('An error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, [id, isAreaAdmin, location.state, requestId, user?.role]);

  // =====    =====
  const checkIfFavorite = useCallback(async () => {
    if (user?.role !== 'tenant' || !user?.id || !id) {
      setIsFavorite(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/favorites/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsFavorite(Boolean(response.data?.isFavorited));
    } catch (error) {
      console.warn('Unable to check favorite status:', error);
      setIsFavorite(getFavoriteIds(user.id).has(String(id)));
    }
  }, [id, user?.id, user?.role]);

  const fetchReviews = useCallback(async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/reviews/property/${id}`);
      setReviews(Array.isArray(response.data) ? response.data : []);
    } catch (reviewError) {
      console.error('Unable to load property reviews:', reviewError);
      setReviews([]);
    }
  }, [id]);

  useEffect(() => {
    fetchProperty();
    checkIfFavorite();
    fetchReviews();
  }, [checkIfFavorite, fetchProperty, fetchReviews]);

  useEffect(() => {
    setSelectedImage('');
  }, [id]);

  // =====   / =====
  const toggleFavorite = async () => {
    if (user?.role !== 'tenant' || !user.id) return;

    try {
      const nextIsFavorite = await toggleFavoriteStorage(user.id, id, localStorage.getItem('token'));
      setIsFavorite(nextIsFavorite);
      alert(nextIsFavorite ? 'Added to favorites' : 'Removed from favorites');
    } catch (error) {
      console.error('Unable to toggle favorite:', error);
      alert('Unable to update favorite right now.');
    }
  };

  // =====    =====
  const handleRentRequest = async (e) => {
    e.preventDefault();
    if (!rentMessage.trim() || !rentMoveInDate || !rentPhone.trim()) {
      setRentalMessage('Please complete the entire form.');
      return;
    }
    setSubmittingRent(true);
    setRentalMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/rent-requests`,
        {
          propertyId: id,
          message: rentMessage,
          moveInDate: rentMoveInDate || null,
          phone: rentPhone,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setRentalMessage(' ' + response.data.message);
      setShowRentModal(false);
      setRentMessage('');
      setRentPhone('');
      setRentMoveInDate('');
    } catch (error) {
      setRentalMessage(' ' + (error.response?.data?.message || 'An error occurred'));
    } finally {
      setSubmittingRent(false);
    }
  };

  // =====    =====
  const contactLandlord = () => {
    setShowContact(!showContact);
  };

  const handleAdminPropertyAction = async (action) => {
    if (!property?._id) return;

    const confirmed = window.confirm(
      action === 'verify'
        ? 'Are you sure you want to verify this property?'
        : 'Are you sure you want to reject this property?'
    );

    if (!confirmed) return;

    setAdminActionLoading(action);
    try {
      const token = localStorage.getItem('token');
      const endpoint = `${process.env.REACT_APP_API_URL}/api/admin/${action === 'verify' ? 'verify-property' : 'reject-property'}/${property._id}`;
      const payload = action === 'reject' ? { comment: 'Documentation insufficient' } : {};

      await axios.put(endpoint, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      navigate('/admin-dashboard/pending', {
        state: {
          message: action === 'verify'
            ? 'Property verified successfully.'
            : 'Property rejected successfully.',
        },
      });
    } catch (err) {
      console.error(`Error ${action === 'verify' ? 'verifying' : 'rejecting'} property:`, err);
      setError(err.response?.data?.message || `Failed to ${action === 'verify' ? 'verify' : 'reject'} property.`);
    } finally {
      setAdminActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="property-loading">
        <div className="property-loading-spinner"></div>
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="property-error">
        <div className="property-error-icon"></div>
        <h2 className="property-error-title">{error}</h2>
        <p className="property-error-desc">{isAreaAdmin ? 'Return to the previous page' : 'Return to the search page'}</p>
        <button onClick={returnFromPropertyDetails} className="property-back-btn">{backButtonLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="property-container">
      {/* =====   ===== */}
      <button onClick={returnFromPropertyDetails} className="property-back-btn">{backButtonLabel}
      </button>

      <div className="property-layout">
        <div className="property-primary-column">
          <div className="property-image-section">
            {getPropertyImages(property).length > 0 ? (
              <>
                <div className="property-main-image-wrap">
                  <PropertyImage
                    src={selectedImage || getPropertyImages(property)[0]}
                    alt={property.title}
                    className="property-image"
                  />
                </div>
                {getPropertyImages(property).length > 1 && (
                  <div className="property-image-thumbnails" aria-label="Property photos">
                    {getPropertyImages(property).map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        className={`property-image-thumbnail-button${(selectedImage || getPropertyImages(property)[0]) === image ? ' active' : ''}`}
                        onClick={() => setSelectedImage(image)}
                        aria-label={`View property photo ${index + 1}`}
                        aria-pressed={(selectedImage || getPropertyImages(property)[0]) === image}
                      >
                        <PropertyImage
                          src={image}
                          alt=""
                          className="property-image-thumbnail"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="property-main-image-wrap">
                <div className="property-no-image">No image</div>
              </div>
            )}
          </div>

          <section className="property-content-card property-description-card">
            <h2 className="property-section-title">Description</h2>
            <p className="property-description">{property?.description}</p>
          </section>

          <section className="property-content-card property-address-card">
            <h2 className="property-section-title">Address</h2>
            <div className="property-address-grid">
              {[
                ['Region', property?.region],
                ['Zone', property?.zone],
                ['Wereda', property?.wereda],
                ['City', property?.city],
                ['Sub-city', property?.subCity],
                ['Kebele', property?.kebele],
                ['House Number', property?.houseNumber],
              ].map(([label, value]) => (
                <div className="property-address-item" key={label}>
                  <span>{label}</span>
                  <strong>{value || 'Not provided'}</strong>
                </div>
              ))}
            </div>
          </section>

          {reviews.length > 0 && (
            <section className="property-content-card property-reviews-section">
              <div className="property-reviews-header">
                <h2 className="property-section-title">Reviews</h2>
              </div>
              <div className="property-reviews-list">
                {reviews.map((review) => (
                  <div key={review._id} className="property-review-item">
                    <div className="property-review-header">
                      <strong>{review.tenant?.name || 'Tenant'}</strong>
                      <span className="property-review-rating">{''.repeat(review.rating)}</span>
                      <small className="property-review-date">{new Date(review.createdAt).toLocaleDateString()}</small>
                    </div>
                    <p className="property-review-comment">{review.comment}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {isAreaAdmin && (
            <section className="property-content-card property-handling-history" aria-labelledby="property-history-title">
              <h2 id="property-history-title" className="property-section-title">{t('History')}</h2>
              {handlingHistoryLoading ? (
                <p>{t('Loading history...')}</p>
              ) : handlingHistoryError ? (
                <p role="alert">{t(handlingHistoryError)}</p>
              ) : handlingHistory.length > 0 ? (
                <ol className="property-history-timeline">
                  {handlingHistory.map((entry, index) => {
                    const isUnknownHandler = !entry.byName
                      || entry.byName === 'Unknown (before history tracking)';
                    const actionLabel = entry.action === 'verified'
                      ? 'Verified'
                      : entry.action === 'returned' ? 'Returned' : 'Rejected';
                    return (
                      <li key={`${entry.byId || entry.byName}-${entry.at}-${index}`} className="property-history-entry">
                        <strong>{t(actionLabel)}</strong>
                        <span>
                          {t('Handled by')}: {isUnknownHandler ? t('Handled before history tracking') : entry.byName}
                          {!isUnknownHandler && entry.isFormerAdmin ? ` ${t('(former admin)')}` : ''}
                        </span>
                        <time dateTime={entry.at}>{entry.at ? formatDate(entry.at, { dateStyle: 'medium', timeStyle: 'short' }) : t('Date unavailable')}</time>
                        {entry.note && <span>{t('Note')}: {entry.note}</span>}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p>{t('No history recorded yet.')}</p>
              )}
            </section>
          )}

          {reviews.length > 0 && (
            <section className="property-content-card property-reviews-section">
              <div className="property-reviews-header">
                <h2 className="property-section-title">Reviews</h2>
              </div>
              <div className="property-reviews-list">
                {reviews.map((review) => (
                  <div key={review._id} className="property-review-item">
                    <div className="property-review-header">
                      <strong>{review.tenant?.name || 'Tenant'}</strong>
                      <span className="property-review-rating">{''.repeat(review.rating)}</span>
                      <small className="property-review-date">{new Date(review.createdAt).toLocaleDateString()}</small>
                    </div>
                    <p className="property-review-comment">{review.comment}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="property-sidebar">
          <section className="property-info property-main-info-card">
            {user?.role !== 'tenant' && (
              <PropertyOwnershipProof
                propertyId={property?._id}
                hasProof={property?.hasVerificationDocument}
                title={property?.title}
                imageClassName="property-image-thumbnail"
              />
            )}
            <div className="property-header">
              <h1 className="property-title">{property?.title}</h1>
              <div className="property-header-actions">
                {property?.isVerified && property?.verificationStatus === 'approved' ? (
                  <span className="property-badge property-badge-verified">
                    <FaCheckCircle aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <span className="property-badge property-badge-pending">Not yet verified</span>
                )}
                {user?.role === 'tenant' && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleFavorite();
                    }}
                    className={`property-fav-btn ${isFavorite ? 'active' : ''}`}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFavorite
                      ? <FaHeart aria-hidden="true" />
                      : <FaRegHeart aria-hidden="true" />}
                  </button>
                )}
              </div>
            </div>
            <p className="property-location">
              <FaMapMarkerAlt aria-hidden="true" />
              <span>{[property?.city, property?.subCity].filter(Boolean).join(', ') || property?.location}</span>
            </p>
            <p className="property-price">
              ETB {property?.price?.toLocaleString()}
              <span>/ month</span>
            </p>
            <div className="property-feature-chips">
              <span className="property-feature-chip">
                <FaBed aria-hidden="true" />
                {property?.bedrooms} {property?.bedrooms === 1 ? 'bedroom' : 'bedrooms'}
              </span>
            </div>

            {user?.role === 'admin' && user?.adminType === 'area' && property && property.verificationStatus === 'pending' && !property.isVerified && (
              <div className="property-contact-section property-admin-actions">
                <button
                  type="button"
                  className="property-rent-btn"
                  onClick={() =>handleAdminPropertyAction('verify')}
                  disabled={adminActionLoading !== false}
                >
                  {adminActionLoading === 'verify' ? 'Verifying...' : 'Verify / Approve'}
                </button>
                <button
                  type="button"
                  className="property-modal-btn property-modal-btn-cancel"
                  onClick={() =>handleAdminPropertyAction('reject')}
                  disabled={adminActionLoading !== false}
                >
                  {adminActionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            )}
          </section>

          {user?.role === 'tenant' && (
            <section className="property-landlord-card">
              <h2 className="property-section-title">Landlord information</h2>
              <div className="property-landlord-profile">
                {property?.landlord?.profilePhoto ? (
                  <img
                    src={property.landlord.profilePhoto}
                    alt={property.landlord.name || 'Landlord'}
                    className="property-landlord-photo"
                  />
                ) : (
                  <div className="property-landlord-photo-fallback"><FaUser aria-hidden="true" /></div>
                )}
                <strong className="property-landlord-name">{property?.landlord?.name || 'Unknown'}</strong>
              </div>
              <div className="property-landlord-contacts">
                <p>
                  <FaPhoneAlt aria-hidden="true" />
                  <span>Phone</span>
                  {property?.landlord?.phone
                    ? <a href={`tel:${property.landlord.phone}`}>{property.landlord.phone}</a>
                    : <strong>Not available</strong>}
                </p>
                <p>
                  <FaEnvelope aria-hidden="true" />
                  <span>Email</span>
                  {property?.landlord?.email
                    ? <a href={`mailto:${property.landlord.email}`}>{property.landlord.email}</a>
                    : <strong>Not available</strong>}
                </p>
              </div>
              <button
                type="button"
                onClick={contactLandlord}
                className="property-contact-btn"
              >
                Contact now
              </button>
              {showContact && (
                <div className="property-contact-info">
                  <p><strong>Phone:</strong> {property?.landlord?.phone || 'Not available'}</p>
                  <p><strong>Email:</strong> {property?.landlord?.email || 'Not available'}</p>
                  <p><small>Contact the landlord directly for more information.</small></p>
                </div>
              )}
            </section>
          )}

          {user?.role === 'tenant' && (
            (property?.isVerified && property?.verificationStatus === 'approved' && property?.availabilityStatus === 'available') ||
            (location.state?.fromRejectedRequest && location.state.property?._id === id)
          ) && (
            <div className="property-rent-section property-rent-cta">
              <button
                onClick={() =>setShowRentModal(true)}
                className="property-rent-btn"
              >
                Request to Rent
              </button>
              <p className="property-rent-info">Click the button to request this property. An admin will review your request.</p>
              {rentalMessage && (
                <p className={`property-rental-message ${rentalMessage.includes('') ? 'success' : 'error'}`}>
                  {rentalMessage}
                </p>
              )}
            </div>
          )}
          {user?.role === 'tenant' && property?.isVerified && property?.availabilityStatus === 'rented' && (
            <p className="property-rental-message error">This property has been rented.</p>
          )}
          {user?.role === 'tenant' && rentalRequest &&
            (rentalRequest.status === 'approved' || rentalRequest.status === 'confirmed') &&
            property?.availabilityStatus === 'rented' &&
            String(property?.rentedBy) === String(user.id) && (
              <div className="property-rent-section property-rent-existing">
                <button type="button" onClick={() =>navigate(`/tenant/rented-property?propertyId=${property._id}`)} className="property-rent-btn">
                  Rented Property
                </button>
              </div>
            )}
        </aside>
      </div>

      {showRentModal && (
        <div className="property-modal-overlay" onClick={() =>setShowRentModal(false)}>
          <div className="property-modal" onClick={(e) =>e.stopPropagation()}>
            <h3 className="property-modal-title">Submit a rental request</h3>
            <p className="property-modal-subtitle">You are requesting <strong>{property?.title}</strong></p>
            <form onSubmit={handleRentRequest} className="property-modal-form">
              <div className="property-modal-field">
                <label className="property-modal-label">Phone *</label>
                <input
                  type="tel"
                  className="property-modal-input"
                  value={rentPhone}
                  required
                  onChange={(e) =>setRentPhone(e.target.value)}
                />
              </div>
              <div className="property-modal-field">
                <label className="property-modal-label">Message *</label>
                <textarea
                  className="property-modal-input property-modal-textarea"
                  placeholder="What would you like to tell the landlord?"
                  value={rentMessage}
                  required
                  onChange={(e) =>setRentMessage(e.target.value)}
                />
              </div>
              <div className="property-modal-field">
                <label className="property-modal-label">Move-in date *</label>
                <input
                  type="date"
                  className="property-modal-input"
                  value={rentMoveInDate}
                  required
                  onChange={(e) =>setRentMoveInDate(e.target.value)}
                />
              </div>
              <div className="property-modal-actions">
                <button
                  type="button"
                  className="property-modal-btn property-modal-btn-submit"
                  onClick={() =>setShowRentModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="property-modal-btn property-modal-btn-submit"
                  disabled={submittingRent}
                >
                  {submittingRent ? 'Sending...' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyDetail;
