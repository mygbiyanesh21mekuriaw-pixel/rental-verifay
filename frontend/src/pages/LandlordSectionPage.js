import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PropertyImage from '../components/PropertyImage';
import PropertyOwnershipProof from '../components/PropertyOwnershipProof';
import { getPropertyImages } from '../utils/propertyMedia';

const sectionConfig = {
  myProperties: {
    title: 'My Properties',
    empty: 'You have not created any properties yet.',
    filter: () =>true,
  },
  verified: { 
    title: 'Verified Properties', 
    empty: 'You have no verified properties yet.',
    filter: (property) =>property.isVerified && property.verificationStatus === 'approved' && property.availabilityStatus !== 'rented'
  },
  underReview: { 
    title: 'Properties Under Review', 
    empty: 'You have no properties under review.',
    filter: (property) => !property.isVerified && property.verificationStatus === 'pending' && property.availabilityStatus !== 'rented'
  },
  rejected: {
    title: 'Rejected Properties',
    empty: 'You have no rejected properties.',
    filter: (property) => !property.isVerified && property.verificationStatus === 'rejected'
  },
  rented: {
    title: 'Rented Properties',
    empty: 'You have no rented properties.',
    filter: (property) =>property.availabilityStatus === 'rented'
  },
};

const getPropertyStatusBadge = (property) => {
  if (property.availabilityStatus === 'rented') {
    return { label: 'Rented', style: styles.rentedBadge };
  }

  if (property.isVerified && property.verificationStatus === 'approved') {
    return { label: 'Verified', style: styles.verifiedBadge };
  }

  if (property.verificationStatus === 'pending') {
    return { label: 'Under review', style: styles.pendingBadge };
  }

  return { label: 'Rejected', style: styles.rejectedBadge };
};

const LandlordSectionPage = ({ type }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.successMessage;
  const [successNotice, setSuccessNotice] = useState(successMessage || '');
  const [properties, setProperties] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const config = sectionConfig[type];

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/properties`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (type === 'rented') {
        try {
          const reviewsResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/reviews/landlord`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setReviews(Array.isArray(reviewsResponse.data) ? reviewsResponse.data : []);
        } catch (reviewError) {
          console.error('Error fetching landlord reviews:', reviewError);
          setReviews([]);
        }
      } else {
        setReviews([]);
      }

      const myProperties = response.data.filter((property) => {
        const landlordId = property.landlord && typeof property.landlord === 'object'
          ? property.landlord._id
          : property.landlord;
        return String(landlordId) === String(user?.id);
      });

      const filteredProperties = type === 'myProperties'
        ? myProperties
        : myProperties.filter(config.filter);
      setProperties(filteredProperties);
    } catch (error) {
      console.error('Error fetching landlord section:', error);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, type, config.filter]);

  useEffect(() => {
    if (config) {
      fetchProperties();
    }
  }, [fetchProperties, config]);

  useEffect(() => {
    if (successMessage) {
      setSuccessNotice(successMessage);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, successMessage]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this property?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${process.env.REACT_APP_API_URL}/api/properties/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchProperties();
      alert('Property deleted successfully.');
    } catch (error) {
      alert('Error deleting property: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleMessage = (property) => {
    navigate(`/landlord/messages?propertyId=${property._id}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  const handleUpdate = (property) => {
    navigate(`/landlord/edit-property/${property._id}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  if (!config) {
    return <div style={styles.container}><p>Invalid section</p></div>;
  }

  return (
    <div className="flex w-full min-w-0 max-w-none flex-col gap-3">
      <h1 className="m-0 text-2xl font-bold text-slate-800">{config.title}</h1>
      {successNotice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status">
          {successNotice}
        </div>
      )}

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : properties.length === 0 ? (
        <div style={styles.noProperties}>{config.empty}</div>
      ) : (
        <div style={styles.grid}>
          {properties.map((property) => (
            <div key={property._id} style={styles.card}>
              <PropertyImage
                src={getPropertyImages(property)}
                alt={property.title}
                style={styles.cardImage}
                fallbackStyle={styles.cardImagePlaceholder}
                fallbackText="No photo"
              />
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{property.title}</h3>
                {(() => {
                  const statusBadge = getPropertyStatusBadge(property);
                  return <span style={statusBadge.style}>{statusBadge.label}</span>;
                })()}
              </div>
              <p style={styles.cardLocation}> {property.location}</p>
              <p style={styles.cardPrice}>ETB {property.price.toLocaleString()}</p>
              {type === 'rented' && property.rentedBy?.name && (
                <p style={styles.cardLocation}>Tenant: {property.rentedBy.name}</p>
              )}
              <PropertyOwnershipProof
                propertyId={property._id}
                hasProof={property.hasVerificationDocument}
                title={property.title}
                style={styles.documentSection}
                imageStyle={styles.documentImage}
              />
              {type === 'rented' && (() => {
                const propertyReviews = reviews.filter((review) => (
                  String(review.property?._id || review.property) === String(property._id)
                ));
                if (propertyReviews.length === 0) return null;

                return (
                  <section style={styles.reviewSection} aria-label={`Tenant reviews for ${property.title}`}>
                    <h4 style={styles.reviewTitle}>Tenant Reviews</h4>
                    {propertyReviews.map((review) => (
                      <article key={review._id} style={styles.reviewCard}>
                        <div style={styles.reviewHeader}>
                          <strong>{review.tenant?.name || 'Tenant'}</strong>
                          <span style={styles.reviewRating} aria-label={`${review.rating} out of 5 stars`}>
                            {''.repeat(review.rating)}
                          </span>
                        </div>
                        <p style={styles.reviewProperty}>{property.title}</p>
                        <p style={styles.reviewComment}>{review.comment}</p>
                        <time style={styles.reviewDate} dateTime={review.createdAt}>
                          {new Date(review.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </time>
                      </article>
                    ))}
                  </section>
                );
              })()}
              <div className={`grid ${type === 'rented' ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 px-4 pb-4`}>
                {type === 'rented' && (
                  <button 
                    onClick={() =>handleMessage(property)}
                    className="h-8 w-full min-w-0 rounded-md border border-[#4299e1] bg-[#4299e1] px-2 text-xs font-bold leading-none text-white transition-colors hover:border-[#3182ce] hover:bg-[#3182ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4299e1] focus-visible:ring-offset-2"
                    title="Send message"
                  >Message
                  </button>
                )}
                <button
                  onClick={() =>handleUpdate(property)}
                  className="h-8 w-full min-w-0 rounded-md border border-[#805ad5] bg-[#805ad5] px-2 text-xs font-bold leading-none text-white transition-colors hover:border-[#6b46c1] hover:bg-[#6b46c1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#805ad5] focus-visible:ring-offset-2"
                  title="Edit property"
                >Update
                </button>
                <button
                  onClick={() =>handleDelete(property._id)}
                  className="h-8 w-full min-w-0 rounded-md border border-[#e53e3e] bg-[#e53e3e] px-2 text-xs font-bold leading-none text-white transition-colors hover:border-[#c53030] hover:bg-[#c53030] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e53e3e] focus-visible:ring-offset-2"
                  title="Delete property"
                >Delete
                </button>
                {type === 'rented' && (
                  <button
                    onClick={() => navigate(`/landlord/rent-payments?propertyId=${property._id}`, {
                      state: { from: `${location.pathname}${location.search}` },
                    })}
                    className="col-span-3 h-8 w-full rounded-md border border-[#d69e2e] bg-[#d69e2e] px-2 text-xs font-bold leading-none text-white transition-colors hover:border-[#b7791f] hover:bg-[#b7791f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d69e2e] focus-visible:ring-offset-2"
                    title="View rent payments"
                  >Rent Payments
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '24px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  title: {
    fontSize: '28px',
    color: '#2d3748',
    margin: 0,
  },
  loading: {
    textAlign: 'center',
    fontSize: '18px',
    color: '#718096',
    padding: '40px',
  },
  noProperties: {
    textAlign: 'center',
    fontSize: '18px',
    color: '#718096',
    padding: '40px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: 'white',
    overflow: 'hidden',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  cardImage: {
    display: 'block',
    width: '100%',
    height: '180px',
    objectFit: 'cover',
    backgroundColor: '#edf2f7',
  },
  cardImagePlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '180px',
    color: '#718096',
    backgroundColor: '#edf2f7',
    fontSize: '18px',
  },
  cardHeader: {
    padding: '16px 16px 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '8px',
  },
  cardTitle: {
    fontSize: '16px',
    margin: 0,
    color: '#2d3748',
    flex: 1,
  },
  verifiedBadge: {
    backgroundColor: '#48bb78',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  rentedBadge: {
    backgroundColor: '#805ad5',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  pendingBadge: {
    backgroundColor: '#ed8936',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  rejectedBadge: {
    backgroundColor: '#e53e3e',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  cardLocation: {
    padding: '0 16px',
    color: '#4a5568',
    fontSize: '13px',
    marginBottom: '2px',
  },
  cardPrice: {
    padding: '0 16px',
    fontSize: '16px',
    fontWeight: '700',
    color: '#2b6cb0',
    marginBottom: '12px',
  },
  documentSection: {
    padding: '0 16px 12px',
  },
  documentImage: {
    display: 'block',
    width: '100%',
    maxHeight: '220px',
    objectFit: 'contain',
    marginTop: '8px',
    border: '1px solid #cbd5e0',
    borderRadius: '8px',
    backgroundColor: '#f7fafc',
  },
  reviewSection: {
    margin: '0 16px 14px',
    paddingTop: '12px',
    borderTop: '1px solid #e2e8f0',
  },
  reviewTitle: {
    margin: '0 0 10px',
    color: '#172033',
    fontSize: '14px',
  },
  reviewCard: {
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
  },
  reviewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    color: '#1e293b',
    fontSize: '13px',
  },
  reviewRating: {
    color: '#ca8a04',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  reviewProperty: {
    margin: '8px 0 0',
    color: '#475569',
    fontSize: '12px',
    fontWeight: '600',
  },
  reviewComment: {
    margin: '8px 0',
    color: '#334155',
    fontSize: '13px',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
  reviewDate: {
    color: '#64748b',
    fontSize: '11px',
  },
};

export default LandlordSectionPage;
