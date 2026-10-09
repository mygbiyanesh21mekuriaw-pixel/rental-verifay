import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './PropertyDetail.css';
import { getFavoriteIds, toggleFavorite as toggleFavoriteStorage } from '../utils/favorites';
import PropertyImage from '../components/PropertyImage';
import PropertyOwnershipProof from '../components/PropertyOwnershipProof';
import { getPropertyImages } from '../utils/propertyMedia';

const PropertyDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId');
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [property, setProperty] = useState(null);
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

  // fetchProperty   useCallback 
  const fetchProperty = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/properties/${id}`,
        { headers }
      );
      setProperty(res.data);
      setRentalRequest(null);

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
  }, [id, location.state, requestId, user?.role]);

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
        <p className="property-error-desc">Return to the search page</p>
        <button onClick={() =>navigate('/search')} className="property-back-btn">Back to search
        </button>
      </div>
    );
  }

  return (
    <div className="property-container">
      {/* =====   ===== */}
      <button onClick={() =>navigate('/search')} className="property-back-btn">Back to search
      </button>

      {/* =====   ===== */}
      <div className="property-card">
        {/*   */}
        <div className="property-image-section">
          {getPropertyImages(property).length > 0 ? (
            <>
              <PropertyImage
                src={getPropertyImages(property)}
                alt={property.title}
                className="property-image"
              />
              {getPropertyImages(property).length > 1 && (
                <div className="property-image-thumbnails">
                  {getPropertyImages(property).slice(1, 5).map((image, index) => (
                    <PropertyImage
                      key={`${image}-${index}`}
                      src={image}
                      alt={`${property.title} ${index + 2}`}
                      className="property-image-thumbnail"
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="property-no-image">No image</div>
          )}
        </div>

        {/*   */}
        <div className="property-info">
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
                <span className="property-badge property-badge-verified">Verified</span>
              ) : (
                <span className="property-badge property-badge-pending">Not yet verified</span>
              )}
              
              {/*   (Tenant ) */}
              {user?.role === 'tenant' && (
                <button 
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavorite();
                  }}
                  className={`property-fav-btn ${isFavorite ? 'active' : ''}`}
                >
                  {isFavorite ? '' : ''}
                </button>
              )}
            </div>
          </div>

          <p className="property-location"> {property?.location}</p>
          {property?.region && (
            <div className="property-address-details">
              <p>Region: {property.region}</p>
              <p>Zone: {property.zone}</p>
              <p>Wereda: {property.wereda}</p>
              <p>City: {property.city}</p>
              <p>Sub-city: {property.subCity}</p>
              <p>Kebele: {property.kebele}</p>
              <p>House Number: {property.houseNumber}</p>
            </div>
          )}
          <p className="property-price">ETB {property?.price?.toLocaleString()}</p>
          <p className="property-bedrooms"> {property?.bedrooms} bedrooms</p>
          
          <div className="property-divider"></div>
          
          <h3 className="property-section-title">Description</h3>
          <p className="property-description">{property?.description}</p>

          <div className="property-divider"></div>

          {/* =====   ===== */}
          <h3 className="property-section-title">Landlord information</h3>
          <div className="property-landlord-profile">
            {property?.landlord?.profilePhoto ? (
              <img
                src={property.landlord.profilePhoto}
                alt={property.landlord.name || 'Landlord'}
                className="property-landlord-photo"
              />
            ) : (
              <div className="property-landlord-photo-fallback"></div>
            )}
            <div>
              <p className="property-landlord">
                <strong>Name:</strong> {property?.landlord?.name || 'Unknown'}
              </p>
              <p className="property-landlord">
                <strong>Phone:</strong> {property?.landlord?.phone || 'Not available'}
              </p>
              <p className="property-landlord">
                <strong>Email:</strong> {property?.landlord?.email || 'Not available'}
              </p>
            </div>
          </div>

          {/* ===== Admin verification actions ===== */}
          {user?.role === 'admin' && user?.adminType === 'area' && property && property.verificationStatus === 'pending' && !property.isVerified && (
            <div className="property-contact-section">
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

          {/* =====   (Tenant ) ===== */}
          {user?.role === 'tenant' && (
            <div className="property-contact-section">
              <button 
                onClick={contactLandlord}
                className="property-contact-btn"
              >Contact now
              </button>
              {showContact && (
                <div className="property-contact-info">
                  <p><strong>Phone:</strong> {property?.landlord?.phone || 'Not available'}</p>
                  <p><strong>Email:</strong> {property?.landlord?.email || 'Not available'}</p>
                  <p><small>Contact the landlord directly for more information.</small></p>
                </div>
              )}
            </div>
          )}

          {/* ===== ""  (Tenant ) ===== */}
          {user?.role === 'tenant' && (
            (property?.isVerified && property?.verificationStatus === 'approved' && property?.availabilityStatus === 'available') ||
            (location.state?.fromRejectedRequest && location.state.property?._id === id)
          ) && (
            <div className="property-rent-section">
              <button 
                onClick={() =>setShowRentModal(true)}
                className="property-rent-btn"
              >Request to Rent
              </button>
              <p className="property-rent-info">Click the button to request this property. An admin will review your request.
              </p>
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
              <div className="property-rent-section">
                <button type="button" onClick={() =>navigate(`/tenant/rented-property?propertyId=${property._id}`)} className="property-rent-btn">Rented Property
                </button>
              </div>
            )}

          {/* =====    ===== */}
          {showRentModal && (
            <div className="property-modal-overlay" onClick={() =>setShowRentModal(false)}>
              <div className="property-modal" onClick={(e) =>e.stopPropagation()}>
                <h3 className="property-modal-title">Submit a rental request</h3>
                <p className="property-modal-subtitle">You are requesting <strong>{property?.title}</strong>
                </p>
                
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
                      className="property-modal-btn property-modal-btn-cancel"
                      onClick={() =>setShowRentModal(false)}
                    >Cancel
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

          {reviews.length > 0 && (
            <>
              <div className="property-divider"></div>
              <div className="property-reviews-section">
                <div className="property-reviews-header">
                  <h3 className="property-section-title">Reviews</h3>
                </div>
                <div className="property-reviews-list">
                  {reviews.map((review) => (
                    <div key={review._id} className="property-review-item">
                      <div className="property-review-header">
                        <strong>{review.tenant?.name || 'Tenant'}</strong>
                        <span className="property-review-rating">
                          {''.repeat(review.rating)}
                        </span>
                        <small className="property-review-date">{new Date(review.createdAt).toLocaleDateString()}</small>
                      </div>
                      <p className="property-review-comment">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyDetail;
