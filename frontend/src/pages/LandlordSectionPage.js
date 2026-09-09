import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const sectionConfig = {
  myProperties: {
    title: '🏠 My Properties',
    empty: 'You have not created any properties yet.',
    filter: () => true,
  },
  verified: { 
    title: '✅ Verified Properties', 
    empty: 'You have no verified properties yet.',
    filter: (property) => property.isVerified && property.verificationStatus === 'approved' && property.availabilityStatus !== 'rented'
  },
  underReview: { 
    title: '⏳ Properties Under Review', 
    empty: 'You have no properties under review.',
    filter: (property) => !property.isVerified && property.verificationStatus === 'pending' && property.availabilityStatus !== 'rented'
  },
  rejected: {
    title: '❌ Rejected Properties',
    empty: 'You have no rejected properties.',
    filter: (property) => !property.isVerified && property.verificationStatus === 'rejected'
  },
  rented: {
    title: '🏠 Rented Properties',
    empty: 'You have no rented properties.',
    filter: (property) => property.availabilityStatus === 'rented'
  },
};

const getPropertyStatusBadge = (property) => {
  if (property.availabilityStatus === 'rented') {
    return { label: '🏠 Rented', style: styles.rentedBadge };
  }

  if (property.isVerified && property.verificationStatus === 'approved') {
    return { label: '✅ Verified', style: styles.verifiedBadge };
  }

  if (property.verificationStatus === 'pending') {
    return { label: '⏳ Under review', style: styles.pendingBadge };
  }

  return { label: '❌ Rejected', style: styles.rejectedBadge };
};

const LandlordSectionPage = ({ type }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const config = sectionConfig[type];

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/properties', {
        headers: { Authorization: `Bearer ${token}` },
      });

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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this property?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:5000/api/properties/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchProperties();
      alert('✅ Property deleted successfully.');
    } catch (error) {
      alert('Error deleting property: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleMessage = (property) => {
    navigate(`/landlord/messages?propertyId=${property._id}`);
  };

  const handleUpdate = (property) => {
    // Navigate to edit property page (to be implemented)
    navigate(`/landlord/edit-property/${property._id}`);
  };

  if (!config) {
    return <div style={styles.container}><p>Invalid section</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>{config.title}</h2>
      </div>

      {loading ? (
        <div style={styles.loading}>⏳ Loading...</div>
      ) : properties.length === 0 ? (
        <div style={styles.noProperties}>{config.empty}</div>
      ) : (
        <div style={styles.grid}>
          {properties.map((property) => (
            <div key={property._id} style={styles.card}>
              {property.images && property.images.length > 0 ? (
                <img
                  src={property.images[0]}
                  alt={property.title}
                  style={styles.cardImage}
                />
              ) : (
                <div style={styles.cardImagePlaceholder}>📸 No photo</div>
              )}
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{property.title}</h3>
                {(() => {
                  const statusBadge = getPropertyStatusBadge(property);
                  return <span style={statusBadge.style}>{statusBadge.label}</span>;
                })()}
              </div>
              <p style={styles.cardLocation}>📍 {property.location}</p>
              <p style={styles.cardPrice}>💰 ETB {property.price.toLocaleString()}</p>
              {property.verificationDocument && (
                <div style={styles.documentSection}>
                  <strong>📄 Proof of Ownership</strong>
                  <img
                    src={property.verificationDocument}
                    alt={`Proof of ownership for ${property.title}`}
                    style={styles.documentImage}
                  />
                </div>
              )}
              <div style={styles.cardActions}>
                {type === 'rented' && (
                  <button 
                    onClick={() => handleMessage(property)}
                    style={styles.messageBtn}
                    title="Send message"
                  >
                    ✉️ Message
                  </button>
                )}
                <button 
                  onClick={() => handleUpdate(property)}
                  style={styles.updateBtn}
                  title="Edit property"
                >
                  ✏️ Update
                </button>
                <button 
                  onClick={() => handleDelete(property._id)}
                  style={styles.deleteBtn}
                  title="Delete property"
                >
                  🗑️ Delete
                </button>
                {type === 'rented' && (
                  <button
                    onClick={() => navigate(`/landlord/rent-payments?propertyId=${property._id}`)}
                    style={styles.paymentBtn}
                    title="View rent payments"
                  >
                    💰 Rent Payments
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
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '30px 20px',
  },
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
  cardActions: {
    padding: '0 16px 16px',
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  messageBtn: {
    flex: 1,
    minWidth: '70px',
    padding: '8px 10px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  updateBtn: {
    flex: 1,
    minWidth: '70px',
    padding: '8px 10px',
    backgroundColor: '#805ad5',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  deleteBtn: {
    flex: 1,
    minWidth: '70px',
    padding: '8px 10px',
    backgroundColor: '#e53e3e',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  paymentBtn: {
    flex: 1,
    minWidth: '110px',
    padding: '8px 10px',
    backgroundColor: '#d69e2e',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  viewBtn: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default LandlordSectionPage;
