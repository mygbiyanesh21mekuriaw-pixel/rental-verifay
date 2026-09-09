import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const SearchPage = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    location: '',
    minPrice: '',
    maxPrice: '',
    verified: false,
  });

  // fetchProperties ን በ useCallback ይከተቱ
  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.location) params.append('location', filters.location);
      if (filters.minPrice) params.append('minPrice', filters.minPrice);
      if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
      if (filters.verified) params.append('verified', 'true');

      const res = await axios.get(
        `http://localhost:5000/api/properties?${params.toString()}`
      );
      setProperties(res.data);
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]); // filters ሲቀየር እንደገና ይፈጠር

  // useEffect በትክክለኛው ቦታ
  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters({
      ...filters,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchProperties();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🔍 Property Search</h2>

      <form onSubmit={handleSearch} style={styles.filterForm}>
        <input
          type="text"
          name="search"
          placeholder="Title or description..."
          value={filters.search}
          onChange={handleFilterChange}
          style={styles.filterInput}
        />
        <input
          type="text"
          name="location"
          placeholder="Location..."
          value={filters.location}
          onChange={handleFilterChange}
          style={styles.filterInput}
        />
        <input
          type="number"
          name="minPrice"
          placeholder="Minimum price"
          value={filters.minPrice}
          onChange={handleFilterChange}
          style={{...styles.filterInput, width: '120px'}}
        />
        <input
          type="number"
          name="maxPrice"
          placeholder="Maximum price"
          value={filters.maxPrice}
          onChange={handleFilterChange}
          style={{...styles.filterInput, width: '120px'}}
        />
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            name="verified"
            checked={filters.verified}
            onChange={handleFilterChange}
          />
          ✅ Verified only
        </label>
        <button type="submit" style={styles.searchBtn}>Search</button>
      </form>

      {loading ? (
        <div style={styles.loading}>⏳ Loading...</div>
      ) : properties.length === 0 ? (
        <div style={styles.noResults}>😕 No properties found</div>
      ) : (
        <div style={styles.grid}>
          {properties.map((property) => (
            <div key={property._id} style={styles.card}>
              <div style={styles.cardImage}>
                {property.images && property.images.length > 0 ? (
                  <img 
                    src={property.images[0]} 
                    alt={property.title}
                    style={styles.image}
                  />
                ) : (
                  <div style={styles.noImage}>📸 No image</div>
                )}
                {property.isVerified && (
                  <div style={styles.verifiedBadge}>✅ Verified</div>
                )}
                {!property.isVerified && property.verificationStatus === 'pending' && (
                  <div style={styles.pendingBadge}>⏳ Under review</div>
                )}
                {!property.isVerified && property.verificationStatus === 'rejected' && (
                  <div style={styles.rejectedBadge}>❌ Rejected</div>
                )}
              </div>
              
              <div style={styles.cardContent}>
                <h3 style={styles.cardTitle}>{property.title}</h3>
                <p style={styles.cardLocation}>📍 {property.location}</p>
                <p style={styles.cardPrice}>💰 ETB {property.price.toLocaleString()}</p>
                <p style={styles.cardBedrooms}>🛏️ {property.bedrooms} bedrooms</p>
                <Link 
                  to={`/property/${property._id}`}
                  style={styles.detailBtn}
                >
                  📖 View details
                </Link>
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
  title: {
    fontSize: '32px',
    marginBottom: '24px',
    color: '#2d3748',
  },
  filterForm: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
    marginBottom: '30px',
    alignItems: 'center',
  },
  filterInput: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    fontSize: '14px',
    flex: '1',
    minWidth: '150px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: '#2d3748',
    whiteSpace: 'nowrap',
  },
  searchBtn: {
    padding: '10px 28px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    fontSize: '20px',
    color: '#718096',
    padding: '40px',
  },
  noResults: {
    textAlign: 'center',
    fontSize: '18px',
    color: '#718096',
    padding: '40px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '24px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    transition: 'transform 0.2s',
  },
  cardImage: {
    height: '200px',
    backgroundColor: '#edf2f7',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  noImage: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: '#a0aec0',
    fontSize: '18px',
  },
  verifiedBadge: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: '#48bb78',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  pendingBadge: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: '#ed8936',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  rejectedBadge: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: '#e53e3e',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  cardContent: {
    padding: '16px',
  },
  cardTitle: {
    fontSize: '18px',
    marginBottom: '6px',
    color: '#2d3748',
  },
  cardLocation: {
    color: '#718096',
    fontSize: '14px',
    marginBottom: '8px',
  },
  cardPrice: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#2b6cb0',
    marginBottom: '4px',
  },
  cardBedrooms: {
    color: '#4a5568',
    fontSize: '14px',
    marginBottom: '12px',
  },
  detailBtn: {
    display: 'inline-block',
    padding: '8px 20px',
    backgroundColor: '#4299e1',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
  },
};

export default SearchPage;