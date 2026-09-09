import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext';
import { getFavoriteIds, toggleFavorite } from '../utils/favorites';
import BackToDashboard from '../components/BackToDashboard';
import './TenantDashboard.css';

const DEFAULT_MAP_CENTER = [9.145, 40.4897];
const MAP_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

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

const getPropertyCoordinates = (property) => {
  if (!property || !Number.isFinite(Number(property.latitude)) || !Number.isFinite(Number(property.longitude))) {
    return null;
  }

  const latitude = Number(property.latitude);
  const longitude = Number(property.longitude);

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return [latitude, longitude];
};

const uniqueProperties = (propertyList) => {
  const seenIds = new Set();
  return propertyList.filter((property) => {
    const propertyId = property?._id?.toString();
    if (!isValidProperty(property) || seenIds.has(propertyId)) return false;
    seenIds.add(propertyId);
    return true;
  });
};

const createMarkerIcon = (selected = false) => L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:${selected ? '#2563eb' : '#10b981'};border:2px solid #fff;box-shadow:0 0 0 6px ${selected ? 'rgba(37,99,235,0.18)' : 'rgba(16,185,129,0.18)'}"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
});

const MapFocus = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.flyTo(center, 11, { duration: 1.2 });
    }
  }, [center, map]);

  return null;
};

const PropertyMap = ({ properties, selectedPropertyId, onSelectProperty }) => {
  const validProperties = useMemo(
    () => properties.filter((property) => getPropertyCoordinates(property)),
    [properties]
  );

  const selectedProperty = validProperties.find((property) => property._id === selectedPropertyId) || validProperties[0];
  const selectedCenter = getPropertyCoordinates(selectedProperty) || DEFAULT_MAP_CENTER;

  if (validProperties.length === 0) {
    return (
      <div className="tenant-map-empty">
        <span>📍</span>
        <p>No properties found in this area.</p>
      </div>
    );
  }

  return (
    <div className="tenant-map-panel">
      <div className="tenant-map-header">
        <strong>Map view</strong>
        <span>{validProperties.length} property markers</span>
      </div>

      <MapContainer center={selectedCenter} zoom={11} scrollWheelZoom className="tenant-map-container">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url={MAP_TILES}
        />
        {validProperties.map((property) => {
          const coords = getPropertyCoordinates(property);
          if (!coords) return null;

          return (
            <Marker
              key={property._id}
              position={coords}
              icon={selectedPropertyId === property._id ? createMarkerIcon(true) : createMarkerIcon(false)}
              eventHandlers={{ click: () => onSelectProperty(property._id) }}
            >
              <Popup>
                <div className="tenant-map-popup">
                  <strong>{property.title}</strong>
                  <span>{property.location}</span>
                  <span>ETB {Number(property.price).toLocaleString()}</span>
                  <span>{property.bedrooms} bedrooms</span>
                  <Link to={`/property/${property._id}`} className="tenant-map-popup-link">View Details</Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <MapFocus center={selectedCenter} />
      </MapContainer>
    </div>
  );
};

const PropertyCard = ({ property, userId, onFavoriteChange, token, selected, onSelect }) => {
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
    <div
      className={`tenant-card ${selected ? 'tenant-card-selected' : ''}`}
      onClick={() => onSelect?.(property._id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(property._id);
        }
      }}
    >
      <div className="tenant-card-image">
        {property.images?.[0] ? <img src={property.images[0]} alt={property.title} /> : <div className="tenant-card-no-image">📸</div>}
        <span className="tenant-card-badge">✅ Verified</span>
      </div>
      <div className="tenant-card-content">
        <h3 className="tenant-card-title">{property.title}</h3>
        <p className="tenant-card-location">📍 {property.location}</p>
        <p className="tenant-card-detail">
          📍 {property.city}, {property.subCity}, Kebele {property.kebele}
        </p>
        <p className="tenant-card-price">💰 ETB {property.price?.toLocaleString()}</p>
        <p className="tenant-card-detail">🚪 {property.bedrooms} bedrooms</p>
        <p className="tenant-card-detail">👤 Landlord: {property.landlord?.name || 'Not available'}</p>
        {getPropertyCoordinates(property) ? (
          <p className="tenant-card-detail">🗺️ Map ready</p>
        ) : (
          <p className="tenant-card-detail">🗺️ Location details pending</p>
        )}
        <p className="tenant-card-description">{property.description}</p>
        <p className="tenant-card-detail">✅ Verification status: Approved</p>
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

const defaultFilters = {
  title: '',
  description: '',
  address: '',
  region: '',
  zone: '',
  wereda: '',
  city: '',
  subCity: '',
  kebele: '',
  houseNumber: '',
  price: '',
  availability: 'any',
  sortPrice: 'recommended',
};

const TenantSearch = () => {
  const { user } = useAuth();
  const [filters, setFilters] = useState(defaultFilters);
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchProperties = useCallback(async (nextFilters = defaultFilters) => {
    const hasAnyInput = Object.entries(nextFilters).some(([key, value]) => {
      if (['availability', 'sortPrice'].includes(key)) return false;
      return String(value ?? '').trim() !== '';
    });

    if (!hasAnyInput) {
      setProperties([]);
      setSelectedPropertyId(null);
      setErrorMessage('');
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams({ verified: 'true' });

      const fieldEntries = [
        ['title', nextFilters.title],
        ['description', nextFilters.description],
        ['address', nextFilters.address],
        ['region', nextFilters.region],
        ['zone', nextFilters.zone],
        ['wereda', nextFilters.wereda],
        ['city', nextFilters.city],
        ['subCity', nextFilters.subCity],
        ['kebele', nextFilters.kebele],
        ['houseNumber', nextFilters.houseNumber],
        ['price', nextFilters.price],
      ];

      fieldEntries.forEach(([fieldName, rawValue]) => {
        const trimmedValue = (rawValue ?? '').trim();
        if (trimmedValue) {
          params.append(fieldName, trimmedValue);
        }
      });

      if (nextFilters.availability === 'available') params.append('availability', 'available');
      if (nextFilters.sortPrice && nextFilters.sortPrice !== 'recommended') params.append('sortPrice', nextFilters.sortPrice);

      const response = await axios.get(`http://localhost:5000/api/properties?${params.toString()}`, { headers });
      const availableProperties = uniqueProperties(response.data);
      setProperties(availableProperties);
      setSelectedPropertyId((current) => {
        if (current && availableProperties.some((property) => property._id === current)) {
          return current;
        }
        return availableProperties[0]?._id || null;
      });
      setHasSearched(true);
    } catch (error) {
      const message = error.response?.data?.message || 'Unable to load properties';
      setErrorMessage(message);
      setProperties([]);
      setSelectedPropertyId(null);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFilters((previous) => ({ ...previous, [name]: value }));
  };

  const handleSearch = (event) => {
    if (event) event.preventDefault();
    const hasAnyInput = Object.entries(filters).some(([key, value]) => {
      if (['availability', 'sortPrice'].includes(key)) return false;
      return String(value ?? '').trim() !== '';
    });

    if (!hasAnyInput) {
      setProperties([]);
      setSelectedPropertyId(null);
      setErrorMessage('');
      setHasSearched(false);
      return;
    }

    fetchProperties(filters);
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters);
    setProperties([]);
    setSelectedPropertyId(null);
    setErrorMessage('');
    setHasSearched(false);
  };

  const handleFavoriteChange = () => {};

  const selectedProperty = properties.find((property) => property._id === selectedPropertyId) || null;

  return (
    <div className="tenant-container">
      <BackToDashboard />

      <div className="tenant-header">
        <h1 className="tenant-title">🔎 Advanced Property Search</h1>
        <p className="tenant-subtitle">Find verified rental properties</p>
      </div>

      <div className="tenant-search-form">
        <form onSubmit={handleSearch} className="tenant-search-main-form">
          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Title</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="title"
                value={filters.title}
                onChange={handleFieldChange}
                placeholder="Title"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by title">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Description</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="description"
                value={filters.description}
                onChange={handleFieldChange}
                placeholder="Description"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by description">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Price</label>
            <div className="tenant-search-input-wrap">
              <input
                type="number"
                min="0"
                name="price"
                value={filters.price}
                onChange={handleFieldChange}
                placeholder="Price"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by price">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <div className="tenant-field-label" style={{ marginBottom: 0 }}>Address</div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Region</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="region"
                value={filters.region}
                onChange={handleFieldChange}
                placeholder="Region"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by region">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Zone</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="zone"
                value={filters.zone}
                onChange={handleFieldChange}
                placeholder="Zone"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by zone">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Wereda</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="wereda"
                value={filters.wereda}
                onChange={handleFieldChange}
                placeholder="Wereda"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by wereda">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">City</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="city"
                value={filters.city}
                onChange={handleFieldChange}
                placeholder="City"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by city">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Sub-city</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="subCity"
                value={filters.subCity}
                onChange={handleFieldChange}
                placeholder="Sub-city"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by sub-city">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">Kebele</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="kebele"
                value={filters.kebele}
                onChange={handleFieldChange}
                placeholder="Kebele"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by kebele">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout">
            <label className="tenant-field-label">House Number</label>
            <div className="tenant-search-input-wrap">
              <input
                type="search"
                name="houseNumber"
                value={filters.houseNumber}
                onChange={handleFieldChange}
                placeholder="House Number"
                className="tenant-search-input"
              />
              <button type="submit" className="tenant-search-icon-btn" aria-label="Search by house number">🔎</button>
            </div>
          </div>

          <div className="tenant-search-controls tenant-search-layout-secondary">
            <select name="availability" value={filters.availability} onChange={handleFieldChange} className="tenant-search-input">
              <option value="any">Availability: Any</option>
              <option value="available">Available only</option>
            </select>

            <select name="sortPrice" value={filters.sortPrice} onChange={handleFieldChange} className="tenant-search-input">
              <option value="recommended">Sort: Recommended</option>
              <option value="asc">Sort: Price low to high</option>
              <option value="desc">Sort: Price high to low</option>
            </select>

            <button type="submit" className="tenant-search-btn">Search</button>
            <button type="button" className="tenant-search-btn tenant-search-clear" onClick={handleClearFilters}>
              Clear Filters
            </button>
          </div>
        </form>
      </div>

      {errorMessage && (
        <div className="tenant-empty">
          <span className="tenant-empty-icon">⚠️</span>
          <p>{errorMessage}</p>
        </div>
      )}

      {!hasSearched && !errorMessage && (
        <div className="tenant-empty" style={{ display: 'none' }} />
      )}

      {loading && (
        <div className="tenant-loading">
          <div className="tenant-loading-spinner"></div>
          <span>⏳ Searching properties...</span>
        </div>
      )}

      {!loading && hasSearched && properties.length === 0 && !errorMessage && (
        <div className="tenant-empty">
          <span className="tenant-empty-icon">😕</span>
          <p>No properties found matching your filters.</p>
        </div>
      )}

      {properties.length > 0 && (
        <>
          <div className="tenant-map-layout">
            <PropertyMap
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              onSelectProperty={setSelectedPropertyId}
            />
          </div>

          <div className="tenant-search-summary-row">
            <p className="tenant-results-count">Found {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}</p>
            {selectedProperty && (
              <div className="tenant-selected-property-banner">
                Focused on: <strong>{selectedProperty.title}</strong> · {selectedProperty.location}
              </div>
            )}
          </div>

          <div className="tenant-grid">
            {properties.map((property) => (
              <PropertyCard
                key={property._id}
                property={property}
                userId={user?.id}
                token={localStorage.getItem('token')}
                onFavoriteChange={handleFavoriteChange}
                selected={selectedPropertyId === property._id}
                onSelect={setSelectedPropertyId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TenantSearch;
