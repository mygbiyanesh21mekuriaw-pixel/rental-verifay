import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaFileAlt, FaHome, FaMapMarkerAlt, FaSearch, FaTrashAlt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import PropertyImage from '../components/PropertyImage';
import PropertyOwnershipProof from '../components/PropertyOwnershipProof';
import { getPropertyImages } from '../utils/propertyMedia';
import './LandlordSectionPage.css';

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

const getRejectedHistoryEntry = (property) => (
  [...(property.history || [])].reverse().find((entry) => entry.action === 'rejected')
);

const getRejectedReason = (property) => {
  const historyNote = getRejectedHistoryEntry(property)?.note;
  const reason = property.rejectionReason || property.rejectionNote || property.rejectionNotes || historyNote;
  return typeof reason === 'string' ? reason.trim() : '';
};

const getRejectedDate = (property) => (
  property.rejectedAt || property.handledAt || getRejectedHistoryEntry(property)?.at
);

const getDisplayLocation = (property, t) => {
  const parts = [property.subCity || property.subcity, property.city || property.location]
    .filter((part) => typeof part === 'string')
    .map((part) => part.trim())
    .filter((part) => part && !['undefined', 'null', 'n/a', 'na', '-'].includes(part.toLowerCase()));
  const uniqueParts = parts.filter((part, index) => (
    parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index
  ));
  return uniqueParts.join(', ') || t('Location unavailable');
};

const getRentedTenantName = (property) => {
  const tenant = property.rentedBy;
  if (tenant && typeof tenant === 'object' && typeof tenant.name === 'string' && tenant.name.trim()) {
    return tenant.name.trim();
  }
  return [property.tenantName, property.renterName].find(
    (name) => typeof name === 'string' && name.trim(),
  )?.trim() || '';
};

const getLatestPaymentStatus = (property) => {
  const status = property.latestPayment?.status || property.paymentStatus;
  if (typeof status !== 'string') return '';
  const normalizedStatus = status.trim().toLowerCase();
  if (normalizedStatus === 'paid') return 'Paid';
  if (normalizedStatus === 'due' || normalizedStatus === 'pending') return 'Due';
  if (normalizedStatus === 'overdue') return 'Overdue';
  return '';
};

const LandlordSectionPage = ({ type }) => {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.successMessage;
  const [successNotice, setSuccessNotice] = useState(successMessage || '');
  const [properties, setProperties] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [propertyFilter, setPropertyFilter] = useState('All');
  const [propertySearch, setPropertySearch] = useState('');
  const [verifiedView, setVerifiedView] = useState(() => {
    try {
      return window.localStorage.getItem('landlord-verified-properties-view') === 'list' ? 'list' : 'grid';
    } catch (error) {
      return 'grid';
    }
  });
  const [underReviewView, setUnderReviewView] = useState(() => {
    try {
      return window.localStorage.getItem('landlord-under-review-properties-view') === 'list' ? 'list' : 'grid';
    } catch (error) {
      return 'grid';
    }
  });
  const [rejectedView, setRejectedView] = useState(() => {
    try {
      return window.localStorage.getItem('landlord-rejected-properties-view') === 'list' ? 'list' : 'grid';
    } catch (error) {
      return 'grid';
    }
  });
  const [rentedView, setRentedView] = useState(() => {
    try {
      return window.localStorage.getItem('landlord-rented-properties-view') === 'list' ? 'list' : 'grid';
    } catch (error) {
      return 'grid';
    }
  });
  const [verifiedSearch, setVerifiedSearch] = useState('');
  const [verifiedSort, setVerifiedSort] = useState('newest');
  const [verifiedPage, setVerifiedPage] = useState(1);
  const [rejectedSearch, setRejectedSearch] = useState('');
  const [rejectedSort, setRejectedSort] = useState('newest');
  const [rejectedPage, setRejectedPage] = useState(1);
  const [rentedSearch, setRentedSearch] = useState('');
  const [rentedSort, setRentedSort] = useState('newest');
  const [rentedPage, setRentedPage] = useState(1);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const config = sectionConfig[type];

  useEffect(() => {
    try {
      if (type === 'verified') {
        window.localStorage.setItem('landlord-verified-properties-view', verifiedView);
      } else if (type === 'underReview') {
        window.localStorage.setItem('landlord-under-review-properties-view', underReviewView);
      } else if (type === 'rejected') {
        window.localStorage.setItem('landlord-rejected-properties-view', rejectedView);
      } else if (type === 'rented') {
        window.localStorage.setItem('landlord-rented-properties-view', rentedView);
      }
    } catch (error) {
      console.warn('Unable to remember the preferred landlord property view:', error);
    }
  }, [rejectedView, rentedView, type, underReviewView, verifiedView]);

  useEffect(() => {
    if (type !== 'verified' && type !== 'underReview' && type !== 'rejected' && type !== 'rented') return undefined;
    const handlePointerDown = (event) => {
      if (menuOpenId
        && !event.target.closest('.landlord-verified-menu-wrap')
        && !event.target.closest('.landlord-verified-menu')) {
        setMenuOpenId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpenId, type]);

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

  const handleRentPayments = (property) => {
    navigate(`/landlord/rent-payments?propertyId=${property._id}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  const handleUpdate = (property) => {
    navigate(`/landlord/edit-property/${property._id}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  const toggleVerifiedMenu = (event, propertyId, includesUpdate = false) => {
    if (menuOpenId === propertyId) {
      setMenuOpenId(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const estimatedMenuHeight = includesUpdate ? 84 : 48;
    const opensAbove = window.innerHeight - bounds.bottom < estimatedMenuHeight + 8;
    setMenuPosition({
      top: Math.max(8, opensAbove ? bounds.top - estimatedMenuHeight - 6 : bounds.bottom + 6),
      right: Math.max(8, window.innerWidth - bounds.right),
    });
    setMenuOpenId(propertyId);
  };

  const renderVerifiedMenu = (property, includesUpdate = false, showDelete = false) => {
    const canShowDelete = showDelete && String(property?.verificationStatus ?? property?.status ?? '').toLowerCase() === 'rejected';
    return (
      <>
        <button
          type="button"
          className="landlord-verified-menu-trigger"
          id={`landlord-verified-trigger-${property._id}`}
          aria-label={`${t('More actions')} ${property.title}`}
          aria-expanded={menuOpenId === property._id}
          aria-controls={`landlord-verified-menu-${property._id}`}
          onClick={(event) => toggleVerifiedMenu(event, property._id, includesUpdate || canShowDelete)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMenuOpenId(null);
            if (event.key === 'ArrowDown' && menuOpenId !== property._id) {
              toggleVerifiedMenu(event, property._id, includesUpdate || canShowDelete);
            }
          }}
        >
          ⋮
        </button>
        {menuOpenId === property._id && createPortal(
          <div
            id={`landlord-verified-menu-${property._id}`}
            className="landlord-verified-menu"
            role="menu"
            aria-label={t('Property actions')}
            style={{ top: menuPosition.top, right: menuPosition.right }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setMenuOpenId(null);
                document.getElementById(`landlord-verified-trigger-${property._id}`)?.focus();
              }
            }}
          >
            {includesUpdate && (
              <button
                type="button"
                className="landlord-verified-menu-item landlord-verified-menu-item-update"
                role="menuitem"
                autoFocus
                onClick={() => {
                  setMenuOpenId(null);
                  handleUpdate(property);
                }}
              >
                {t('Update')}
              </button>
            )}
            {canShowDelete && (
              <button
                type="button"
                className="landlord-verified-menu-item"
                role="menuitem"
                autoFocus={!includesUpdate}
                onClick={() => {
                  setMenuOpenId(null);
                  handleDelete(property._id);
                }}
              >
                {t('Delete')}
              </button>
            )}
          </div>,
          document.body,
        )}
      </>
    );
  };

  const myPropertyCounts = properties.reduce((counts, property) => {
    counts[getPropertyStatusBadge(property).label] += 1;
    return counts;
  }, { Verified: 0, 'Under review': 0, Rented: 0, Rejected: 0 });

  const filteredMyProperties = properties.filter((property) => {
    const matchesStatus = propertyFilter === 'All' || getPropertyStatusBadge(property).label === propertyFilter;
    const searchValue = [
      property.title,
      property.location,
      property.region,
      property.zone,
      property.wereda,
      property.city,
      property.subCity,
      property.kebele,
      property.houseNumber,
    ].filter(Boolean).join(' ').toLowerCase();
    return matchesStatus && searchValue.includes(propertySearch.trim().toLowerCase());
  });

  const verifiedFilteredProperties = useMemo(() => {
    const query = verifiedSearch.trim().toLowerCase();
    return [...properties]
      .filter((property) => {
        if (!query) return true;
        const searchable = [
          property.title,
          property.location,
          property.city,
          property.subCity,
          property.subcity,
          property.region,
          property.zone,
          property.wereda,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(query);
      })
      .sort((left, right) => {
        if (verifiedSort === 'price-asc') return Number(left.price || 0) - Number(right.price || 0);
        if (verifiedSort === 'price-desc') return Number(right.price || 0) - Number(left.price || 0);
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        return rightTime - leftTime;
      });
  }, [properties, verifiedSearch, verifiedSort]);

  const verifiedPageCount = Math.max(1, Math.ceil(verifiedFilteredProperties.length / 12));
  const verifiedVisibleProperties = verifiedFilteredProperties.slice((verifiedPage - 1) * 12, verifiedPage * 12);

  const rejectedFilteredProperties = useMemo(() => {
    const query = rejectedSearch.trim().toLowerCase();
    return [...properties]
      .filter((property) => {
        if (!query) return true;
        return [
          property.title,
          property.location,
          property.city,
          property.subCity,
          property.subcity,
          property.region,
          property.zone,
          property.wereda,
        ].filter(Boolean).join(' ').toLowerCase().includes(query);
      })
      .sort((left, right) => {
        if (rejectedSort === 'price-asc') return Number(left.price || 0) - Number(right.price || 0);
        if (rejectedSort === 'price-desc') return Number(right.price || 0) - Number(left.price || 0);
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        return rightTime - leftTime;
      });
  }, [properties, rejectedSearch, rejectedSort]);

  const rejectedPageCount = Math.max(1, Math.ceil(rejectedFilteredProperties.length / 12));
  const rejectedVisibleProperties = rejectedFilteredProperties.slice((rejectedPage - 1) * 12, rejectedPage * 12);

  const rentedFilteredProperties = useMemo(() => {
    const query = rentedSearch.trim().toLowerCase();
    return [...properties]
      .filter((property) => {
        if (!query) return true;
        const searchable = [
          property.title,
          property.location,
          property.city,
          property.subCity,
          property.subcity,
          property.region,
          property.zone,
          property.wereda,
          property.kebele,
          property.houseNumber,
          getRentedTenantName(property),
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(query);
      })
      .sort((left, right) => {
        if (rentedSort === 'price-asc') return Number(left.price || 0) - Number(right.price || 0);
        if (rentedSort === 'price-desc') return Number(right.price || 0) - Number(left.price || 0);
        const leftTime = new Date(left.rentedAt || left.createdAt || 0).getTime();
        const rightTime = new Date(right.rentedAt || right.createdAt || 0).getTime();
        return rightTime - leftTime;
      });
  }, [properties, rentedSearch, rentedSort]);

  const rentedPageCount = Math.max(1, Math.ceil(rentedFilteredProperties.length / 12));
  const rentedVisibleProperties = rentedFilteredProperties.slice((rentedPage - 1) * 12, rentedPage * 12);

  useEffect(() => {
    if (verifiedPage > verifiedPageCount) {
      setVerifiedPage(verifiedPageCount);
    }
  }, [verifiedPage, verifiedPageCount]);

  useEffect(() => {
    if (rejectedPage > rejectedPageCount) {
      setRejectedPage(rejectedPageCount);
    }
  }, [rejectedPage, rejectedPageCount]);

  useEffect(() => {
    if (rentedPage > rentedPageCount) {
      setRentedPage(rentedPageCount);
    }
  }, [rentedPage, rentedPageCount]);

  if (!config) {
    return <div style={styles.container}><p>Invalid section</p></div>;
  }

  if (type === 'verified' || type === 'underReview' || type === 'rejected' || type === 'rented') {
    const isUnderReview = type === 'underReview';
    const isRejected = type === 'rejected';
    const isRented = type === 'rented';
    const currentView = isRented ? rentedView : isRejected ? rejectedView : isUnderReview ? underReviewView : verifiedView;
    const setCurrentView = isRented ? setRentedView : isRejected ? setRejectedView : isUnderReview ? setUnderReviewView : setVerifiedView;
    const currentSearch = isRented ? rentedSearch : isRejected ? rejectedSearch : verifiedSearch;
    const setCurrentSearch = isRented ? setRentedSearch : isRejected ? setRejectedSearch : setVerifiedSearch;
    const currentSort = isRented ? rentedSort : isRejected ? rejectedSort : verifiedSort;
    const setCurrentSort = isRented ? setRentedSort : isRejected ? setRejectedSort : setVerifiedSort;
    const currentPage = isRented ? rentedPage : isRejected ? rejectedPage : verifiedPage;
    const setCurrentPage = isRented ? setRentedPage : isRejected ? setRejectedPage : setVerifiedPage;
    const currentPageCount = isRented ? rentedPageCount : isRejected ? rejectedPageCount : verifiedPageCount;
    const filteredPageProperties = isRented ? rentedFilteredProperties : isRejected ? rejectedFilteredProperties : verifiedFilteredProperties;
    const visiblePageProperties = isRented ? rentedVisibleProperties : isRejected ? rejectedVisibleProperties : verifiedVisibleProperties;
    const formattedCount = filteredPageProperties.length;

    return (
      <div className={`landlord-verified-page${isRejected ? ' landlord-rejected-page' : ''}${isRented ? ' landlord-rented-page' : ''}`}>
        <header className="landlord-verified-header">
          <div className="landlord-verified-header-row">
            <h1>
              {config.title}
              <span>{formattedCount}</span>
            </h1>
          </div>

          <div className="landlord-verified-toolbar">
            <label className="landlord-verified-search" htmlFor="landlord-verified-search">
              <FaSearch aria-hidden="true" />
              <input
                id="landlord-verified-search"
                type="search"
                value={currentSearch}
                onChange={(event) => {
                  setCurrentSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t(isRented ? 'Search title, address, or tenant' : 'Search title or address')}
                aria-label={t(isRented ? 'Search title, address, or tenant' : 'Search title or address')}
              />
            </label>

            <label className="landlord-verified-sort" htmlFor="landlord-verified-sort">
              <span>{t('Sort')}</span>
              <select
                id="landlord-verified-sort"
                value={currentSort}
                onChange={(event) => {
                  setCurrentSort(event.target.value);
                  setCurrentPage(1);
                }}
                aria-label={t('Sort')}
              >
                <option value="newest">{t('Newest')}</option>
                <option value="price-asc">{t('Price: low to high')}</option>
                <option value="price-desc">{t('Price: high to low')}</option>
              </select>
            </label>

            <div className="landlord-verified-view-toggle" role="group" aria-label={t('Property view')}>
              <button
                type="button"
                aria-pressed={currentView === 'grid'}
                onClick={() => setCurrentView('grid')}
                className={currentView === 'grid' ? 'active' : ''}
              >
                {t('Grid')}
              </button>
              <button
                type="button"
                aria-pressed={currentView === 'list'}
                onClick={() => setCurrentView('list')}
                className={currentView === 'list' ? 'active' : ''}
              >
                {t('List')}
              </button>
            </div>
          </div>
        </header>

        {successNotice && (
          <div className="landlord-verified-success" role="status">
            {successNotice}
          </div>
        )}

        {loading ? (
          <div className="landlord-verified-skeleton-grid" role="status" aria-label={t('Loading properties...')}>
            {Array.from({ length: 6 }, (_, index) => (
              <div className="landlord-verified-skeleton-card" key={index} aria-hidden="true">
                <span className="landlord-verified-skeleton-image" />
                <span className="landlord-verified-skeleton-line short" />
                <span className="landlord-verified-skeleton-line" />
                <span className="landlord-verified-skeleton-line" />
              </div>
            ))}
          </div>
        ) : filteredPageProperties.length === 0 ? (
          <div className="landlord-verified-empty" role="status">
            <FaHome aria-hidden="true" />
            <p>
              {currentSearch
                ? t('No properties match your filters.')
                : isRented
                  ? t('No rented properties yet')
                  : isUnderReview
                  ? t('No properties under review')
                  : isRejected ? t('No rejected properties') : config.empty}
            </p>
            {isUnderReview && !currentSearch && (
              <Link to="/landlord/add-property" className="landlord-my-properties-add-button">
                {t('Add House')}
              </Link>
            )}
          </div>
        ) : currentView === 'grid' ? (
          <>
            <div
              className={`landlord-verified-grid${isRented ? ' landlord-rented-grid' : ''}`}
              data-testid={isRented ? 'landlord-rented-grid' : undefined}
            >
              {visiblePageProperties.map((property) => {
                if (isRented) {
                  const tenantName = getRentedTenantName(property);
                  const paymentStatus = getLatestPaymentStatus(property);
                  const propertyReviews = reviews.filter((review) => (
                    String(review.property?._id || review.property) === String(property._id)
                  ));

                  return (
                    <article key={property._id} className="landlord-verified-card landlord-rented-card">
                      <div className="landlord-verified-image-wrap">
                        <PropertyImage
                          src={getPropertyImages(property)}
                          alt={property.title}
                          className="landlord-verified-image"
                          fallbackClassName="landlord-verified-image landlord-verified-image-placeholder"
                          fallbackText={t('No photo')}
                        />
                        <span className="landlord-verified-badge landlord-rented-badge" role="status">
                          {t('Rented')}
                        </span>
                      </div>
                      <div className="landlord-verified-content">
                        <h2 title={property.title}>{property.title}</h2>
                        <p className="landlord-verified-location">
                          <FaMapMarkerAlt aria-hidden="true" />
                          <span>{getDisplayLocation(property, t)}</span>
                        </p>
                        <p className="landlord-verified-price">
                          ETB {Number(property.price || 0).toLocaleString()}
                          <span>{t('/ month')}</span>
                        </p>
                        {property.bedrooms !== undefined && property.bedrooms !== null && (
                          <div className="landlord-verified-meta">
                            <span>{t('Bedrooms: {count}', { count: property.bedrooms })}</span>
                          </div>
                        )}
                        <section className="landlord-rented-tenant" aria-label={t('Tenant information')}>
                          <span className="landlord-rented-tenant-label">{t('Tenant')}</span>
                          <strong>{tenantName || t('Unknown tenant')}</strong>
                          {property.rentedAt && (
                            <span>{t('Rented since {date}', {
                              date: formatDate(property.rentedAt, { dateStyle: 'medium' }),
                            })}</span>
                          )}
                          {paymentStatus && (
                            <span className={`landlord-rented-payment-status landlord-rented-payment-${paymentStatus.toLowerCase()}`}>
                              {t(paymentStatus)}
                            </span>
                          )}
                        </section>
                        {propertyReviews.length > 0 && (
                          <details className="landlord-rented-reviews">
                            <summary>{t('Tenant reviews ({count})', { count: propertyReviews.length })}</summary>
                            {propertyReviews.map((review) => (
                              <article key={review._id} className="landlord-rented-review">
                                <div>
                                  <strong>{review.tenant?.name || t('Tenant')}</strong>
                                  <span aria-label={t('{count} out of 5 stars', { count: review.rating })}>
                                    {'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}
                                  </span>
                                </div>
                                <p>{review.comment}</p>
                                {review.createdAt && (
                                  <time dateTime={review.createdAt}>
                                    {formatDate(review.createdAt, { dateStyle: 'medium' })}
                                  </time>
                                )}
                              </article>
                            ))}
                          </details>
                        )}
                        <div className="landlord-rented-actions">
                          <button
                            type="button"
                            className="landlord-rented-action-message"
                            onClick={() => handleMessage(property)}
                          >
                            {t('Message')}
                          </button>
                          <button
                            type="button"
                            className="landlord-rented-action-payments"
                            onClick={() => handleRentPayments(property)}
                          >
                            {t('Rent Payments')}
                          </button>
                          <div className="landlord-verified-menu-wrap">
                            {renderVerifiedMenu(property, true, false)}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                }

                const locationText = isRejected
                  ? getDisplayLocation(property, t)
                  : [property.subCity || property.subcity, property.city || property.location]
                    .filter(Boolean)
                    .join(', ') || property.location || t('Location unavailable');
                const rejectedReason = isRejected ? getRejectedReason(property) : '';
                const rejectedDate = isRejected ? getRejectedDate(property) : null;

                return (
                  <article key={property._id} className="landlord-verified-card">
                    <div className="landlord-verified-image-wrap">
                      <PropertyImage
                        src={getPropertyImages(property)}
                        alt={property.title}
                        className="landlord-verified-image"
                        fallbackClassName="landlord-verified-image landlord-verified-image-placeholder"
                        fallbackText={t('No photo')}
                      />
                      <span
                        className={`landlord-verified-badge${isUnderReview ? ' landlord-under-review-badge' : ''}${isRejected ? ' landlord-rejected-badge' : ''}`}
                        role="status"
                      >
                        {t(isRejected ? 'Rejected' : isUnderReview ? 'Under review' : 'Verified')}
                      </span>
                    </div>

                    <div className="landlord-verified-content">
                      <h2 title={property.title}>{property.title}</h2>

                      <p className="landlord-verified-location">
                        <FaMapMarkerAlt aria-hidden="true" />
                        <span>{locationText}</span>
                      </p>

                      <p className="landlord-verified-price">
                        ETB {Number(property.price || 0).toLocaleString()}
                        <span>{t('/ month')}</span>
                      </p>

                      <div className="landlord-verified-meta">
                        {property.bedrooms !== undefined && property.bedrooms !== null && (
                          <span>{t('Bedrooms: {count}', { count: property.bedrooms })}</span>
                        )}
                        {property.createdAt && !isRejected && (
                          <span>
                            {t(isUnderReview ? 'Submitted {date}' : 'Submitted: {date}', {
                              date: formatDate(property.createdAt, { dateStyle: 'medium' }),
                            })}
                          </span>
                        )}
                        {isRejected && rejectedDate && (
                          <span>
                            {t('Rejected {date}', { date: formatDate(rejectedDate, { dateStyle: 'medium' }) })}
                          </span>
                        )}
                        {isRejected && property.rejectedByName && (
                          <span>{t('Rejected by {name}', { name: property.rejectedByName })}</span>
                        )}
                        {isUnderReview && (
                          <span className="landlord-verified-review-status">
                            {t('Waiting for review')}
                            {property.area && <>{' · '}{property.area}</>}
                          </span>
                        )}
                      </div>

                      {isRejected && rejectedReason && (
                        <div className="landlord-rejected-reason">
                          <strong>{t('Reason for rejection')}</strong>
                          <p>{rejectedReason}</p>
                          <Link
                            to={`/property/${property._id}`}
                            state={{ from: `${location.pathname}${location.search}` }}
                          >
                            {t('Read more')}
                          </Link>
                        </div>
                      )}

                      <div className="landlord-verified-actions">
                        <button
                          type="button"
                          className="landlord-verified-update"
                          onClick={() => handleUpdate(property)}
                        >
                          {t('Update')}
                        </button>

                        <div className="landlord-verified-menu-wrap" />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {currentPageCount > 1 && (
              <nav className="landlord-verified-pagination" aria-label={t('Property pagination')}>
                <button
                  type="button"
                  className="landlord-verified-page-button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                >
                  {t('Previous')}
                </button>
                <span>{t('Page {current} of {total}', { current: currentPage, total: currentPageCount })}</span>
                <button
                  type="button"
                  className="landlord-verified-page-button"
                  disabled={currentPage >= currentPageCount}
                  onClick={() => setCurrentPage((current) => Math.min(currentPageCount, current + 1))}
                >
                  {t('Next')}
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className={`landlord-verified-table-wrap${isRented ? ' landlord-rented-table-wrap' : ''}`}>
            <table
              className={`landlord-verified-table${isRented ? ' landlord-rented-table' : ''}`}
              aria-label={t(isRented ? 'Rented Properties' : isRejected ? 'Rejected Properties' : isUnderReview ? 'Properties Under Review' : 'Verified Properties')}
            >
              <thead>
                <tr>
                  <th>{t('Property')}</th>
                  <th>{t('Location')}</th>
                  <th>{t('Price')}</th>
                  {isRented ? (
                    <>
                      <th>{t('Tenant')}</th>
                      <th>{t('Payment status')}</th>
                    </>
                  ) : <th>{t(isRejected ? 'Rejected on' : 'Submitted')}</th>}
                  {isRejected && <th>{t('Rejection reason')}</th>}
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visiblePageProperties.map((property) => {
                  const tenantName = getRentedTenantName(property);
                  const paymentStatus = getLatestPaymentStatus(property);
                  return (
                  <tr key={property._id}>
                    <td data-label={t('Property')}>
                      <div className="landlord-verified-table-title">
                        <PropertyImage
                          src={getPropertyImages(property)}
                          alt={property.title}
                          className="landlord-verified-table-thumb"
                          fallbackClassName="landlord-verified-table-thumb landlord-verified-image-placeholder"
                          fallbackText={t('No image')}
                        />
                        <span>{property.title}</span>
                      </div>
                    </td>
                    <td data-label={t('Location')}>
                      {isRented || isRejected
                        ? getDisplayLocation(property, t)
                        : [property.subCity || property.subcity, property.city || property.location]
                          .filter(Boolean).join(', ') || property.location || t('Location unavailable')}
                    </td>
                    <td data-label={t('Price')} className="landlord-verified-table-price">
                      ETB {Number(property.price || 0).toLocaleString()} {t('/ month')}
                    </td>
                    {isRented ? (
                      <>
                        <td data-label={t('Tenant')}>{tenantName || t('Unknown tenant')}</td>
                        <td data-label={t('Payment status')}>
                          {paymentStatus
                            ? <span className={`landlord-rented-payment-status landlord-rented-payment-${paymentStatus.toLowerCase()}`}>{t(paymentStatus)}</span>
                            : '—'}
                        </td>
                      </>
                    ) : (
                      <td data-label={t(isRejected ? 'Rejected on' : 'Submitted')}>
                        {isRejected
                          ? (
                            <>
                              {getRejectedDate(property) && formatDate(getRejectedDate(property), { dateStyle: 'medium' })}
                              {property.rejectedByName && (
                                <small className="landlord-rejected-by">{t('Rejected by {name}', { name: property.rejectedByName })}</small>
                              )}
                            </>
                          )
                          : property.createdAt && formatDate(property.createdAt, { dateStyle: 'medium' })}
                      </td>
                    )}
                    {isRejected && (
                      <td data-label={t('Rejection reason')}>
                        {getRejectedReason(property) && (
                          <div className="landlord-rejected-table-reason">
                            <strong>{t('Reason for rejection')}</strong>
                            <span>{getRejectedReason(property)}</span>
                            <Link
                              to={`/property/${property._id}`}
                              state={{ from: `${location.pathname}${location.search}` }}
                            >
                              {t('Read more')}
                            </Link>
                          </div>
                        )}
                      </td>
                    )}
                    <td data-label={t('Actions')}>
                      <div className="landlord-verified-table-actions">
                        {isRented ? (
                          <>
                            <button type="button" className="landlord-rented-table-action" onClick={() => handleMessage(property)}>
                              {t('Message')}
                            </button>
                            <button type="button" className="landlord-rented-table-action" onClick={() => handleRentPayments(property)}>
                              {t('Rent Payments')}
                            </button>
                            <div className="landlord-verified-menu-wrap">{renderVerifiedMenu(property, true)}</div>
                          </>
                        ) : (
                          <>
                            <button type="button" className="landlord-verified-update landlord-verified-update-small" onClick={() => handleUpdate(property)}>
                              {t('Update')}
                            </button>
                            <div className="landlord-verified-menu-wrap">{renderVerifiedMenu(property)}</div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {currentPageCount > 1 && currentView === 'list' && (
          <nav className="landlord-verified-pagination" aria-label={t('Property pagination')}>
            <button
              type="button"
              className="landlord-verified-page-button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
            >
              {t('Previous')}
            </button>
            <span>{t('Page {current} of {total}', { current: currentPage, total: currentPageCount })}</span>
            <button
              type="button"
              className="landlord-verified-page-button"
              disabled={currentPage >= currentPageCount}
              onClick={() => setCurrentPage((current) => Math.min(currentPageCount, current + 1))}
            >
              {t('Next')}
            </button>
          </nav>
        )}
      </div>
    );
  }

  if (type === 'myProperties') {
    const filters = [
      ['All', properties.length],
      ['Verified', myPropertyCounts.Verified],
      ['Under review', myPropertyCounts['Under review']],
      ['Rented', myPropertyCounts.Rented],
      ['Rejected', myPropertyCounts.Rejected],
    ];

    return (
      <div className="landlord-my-properties">
        <header className="landlord-my-properties-header">
          <div>
            <h1>{config.title} <span>{properties.length}</span></h1>
            <p>Manage your property listings</p>
          </div>
        </header>

        {successNotice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status">
            {successNotice}
          </div>
        )}

        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : properties.length === 0 ? (
          <div className="landlord-my-properties-empty">
            <FaHome aria-hidden="true" />
            <p>{config.empty}</p>
            <Link to="/landlord/add-property" className="landlord-my-properties-add-button">Add your first house</Link>
          </div>
        ) : (
          <>
            <div className="landlord-my-properties-toolbar">
              <div className="landlord-my-properties-tabs" role="tablist" aria-label="Filter properties by status">
                {filters.map(([label, count]) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={propertyFilter === label}
                    className={propertyFilter === label ? 'active' : ''}
                    onClick={() => setPropertyFilter(label)}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
              <label className="landlord-my-properties-search">
                <FaSearch aria-hidden="true" />
                <input
                  type="search"
                  value={propertySearch}
                  onChange={(event) => setPropertySearch(event.target.value)}
                  placeholder="Search title or address"
                  aria-label="Search title or address"
                />
              </label>
            </div>

            {filteredMyProperties.length === 0 ? (
              <div className="landlord-my-properties-no-results" role="status">
                No properties match your filters.
              </div>
            ) : (
              <div className="landlord-my-properties-grid">
                {filteredMyProperties.map((property) => {
                  const statusBadge = getPropertyStatusBadge(property);
                  const statusClass = statusBadge.label.toLowerCase().replace(/\s+/g, '-');
                  return (
                    <article key={property._id} className="landlord-my-property-card">
                      <div className="landlord-my-property-image-wrap">
                        <PropertyImage
                          src={getPropertyImages(property)}
                          alt={property.title}
                          className="landlord-my-property-image"
                          fallbackClassName="landlord-my-property-image landlord-my-property-image-placeholder"
                          fallbackText="No photo"
                        />
                        <span
                          className={`landlord-my-property-status landlord-status-${statusClass}`}
                          role="status"
                        >
                          <span aria-hidden="true" />
                          {statusBadge.label}
                        </span>
                      </div>
                      <div className="landlord-my-property-content">
                        <h2 title={property.title}>{property.title}</h2>
                        <p className="landlord-my-property-address">
                          <FaMapMarkerAlt aria-hidden="true" />
                          <span>{property.location}</span>
                        </p>
                        <p className="landlord-my-property-price">
                          ETB {property.price.toLocaleString()} <span>/ month</span>
                        </p>
                        {type === 'rented' && property.rentedBy?.name && (
                          <p className="landlord-my-property-tenant">Tenant: {property.rentedBy.name}</p>
                        )}
                        <div className="landlord-my-property-proof">
                          <FaFileAlt aria-hidden="true" />
                          <span className="landlord-my-property-proof-title">Proof of ownership</span>
                          {property.hasVerificationDocument ? (
                            <>
                              <PropertyOwnershipProof
                                propertyId={property._id}
                                hasProof={property.hasVerificationDocument}
                                title={property.title}
                                showLabel={false}
                                className="landlord-my-property-proof-loader"
                                imageClassName="landlord-my-property-proof-image"
                                fallbackClassName="landlord-my-property-proof-error"
                              />
                              <Link to={`/property/${property._id}`} className="landlord-my-property-proof-view">
                                View
                              </Link>
                            </>
                          ) : (
                            <span className="landlord-my-property-proof-missing">Not uploaded</span>
                          )}
                        </div>
                        <div className="landlord-my-property-actions">
                          <button
                            type="button"
                            onClick={() => handleUpdate(property)}
                            className="landlord-my-property-update"
                            title="Edit property"
                          >
                            Update
                          </button>
                          {String(property?.verificationStatus ?? property?.status ?? '').toLowerCase() === 'rejected' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(property._id)}
                              className="landlord-my-property-delete"
                              aria-label="Delete"
                              title="Delete property"
                            >
                              <FaTrashAlt aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
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
