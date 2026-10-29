import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import PropertyImage from './PropertyImage';
import RejectionReasonModal from './RejectionReasonModal';
import { getPropertyImages } from '../utils/propertyMedia';

const PAGE_SIZE = 12;
const VIEW_STORAGE_KEY = 'admin-properties-view';

const statusDetails = {
  pending: { label: 'Under Review', className: 'is-under-review' },
  approved: { label: 'Verified', className: 'is-verified' },
  rejected: { label: 'Rejected', className: 'is-rejected' },
};

const getStatus = (property) => {
  if (property.isVerified && property.verificationStatus === 'approved') return 'approved';
  if (!property.isVerified && property.verificationStatus === 'rejected') return 'rejected';
  return 'pending';
};

const getLocation = (property) => {
  const place = [property.city, property.subCity || property.subcity].filter(Boolean).join(', ');
  return [place, property.area].filter(Boolean).join(' · ') || property.location || '';
};

const getHandlerSummary = (property, formatDate, t) => {
  const decision = property.decision || (
    property.verificationStatus === 'approved' ? 'verified' : property.verificationStatus
  );
  if (!['verified', 'rejected'].includes(decision)) return '';
  const historyEntry = [...(property.history || [])].reverse()
    .find((entry) => entry.action === decision && entry.byName);
  const name = property.handledByName || historyEntry?.byName;
  if (!name || name === 'Unknown (before history tracking)') return '';
  const date = property.handledAt || historyEntry?.at;
  return t(
    decision === 'verified' ? 'Verified by {name} · {date}' : 'Rejected by {name} · {date}',
    {
      name,
      date: date ? formatDate(date, { dateStyle: 'medium' }) : t('Date unavailable'),
    },
  );
};

const AreaPropertyList = ({
  properties = [],
  loading = false,
  error = '',
  canManageVerification = false,
  actionLoading = null,
  onAction = () => {},
  onViewDetails = () => {},
  remoteFilters = false,
  search: remoteSearch = '',
  onSearchChange,
  sort: remoteSort = 'newest',
  onSortChange,
  minPrice: remoteMinPrice = '',
  onMinPriceChange,
  maxPrice: remoteMaxPrice = '',
  onMaxPriceChange,
  serverPagination,
  onPageChange,
}) => {
  const { t, formatDate } = useLanguage();
  const [view, setView] = useState(() => {
    try {
      return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
    } catch (error) {
      return 'grid';
    }
  });
  const [localSearch, setLocalSearch] = useState('');
  const [localSort, setLocalSort] = useState('newest');
  const [localMinPrice, setLocalMinPrice] = useState('');
  const [localMaxPrice, setLocalMaxPrice] = useState('');
  const [localPage, setLocalPage] = useState(1);
  const [rejectionProperty, setRejectionProperty] = useState(null);
  const [rejectionFeedback, setRejectionFeedback] = useState('');
  const rejectionTriggerRef = React.useRef(null);

  const search = remoteFilters ? remoteSearch : localSearch;
  const sort = remoteFilters ? remoteSort : localSort;
  const minPrice = remoteFilters ? remoteMinPrice : localMinPrice;
  const maxPrice = remoteFilters ? remoteMaxPrice : localMaxPrice;

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch (error) {
      console.warn('Unable to remember the preferred property view:', error);
    }
  }, [view]);

  const filteredProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const minimum = minPrice === '' ? null : Number(minPrice);
    const maximum = maxPrice === '' ? null : Number(maxPrice);
    const filtered = properties.filter((property) => {
      const searchable = [
        property.title,
        property.landlord?.name,
        property.location,
        property.region,
        property.zone,
        property.wereda,
        property.city,
        property.subCity,
        property.subcity,
        property.area,
      ].join(' ').toLocaleLowerCase();
      const price = Number(property.price || 0);
      return (!query || searchable.includes(query))
        && (minimum === null || price >= minimum)
        && (maximum === null || price <= maximum);
    });

    return filtered.sort((left, right) => {
      if (sort === 'price-asc') return Number(left.price || 0) - Number(right.price || 0);
      if (sort === 'price-desc') return Number(right.price || 0) - Number(left.price || 0);
      return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
    });
  }, [maxPrice, minPrice, properties, search, sort]);

  const pageCount = remoteFilters
    ? Math.max(1, Number(serverPagination?.totalPages || 1))
    : Math.max(1, Math.ceil(filteredProperties.length / PAGE_SIZE));
  const page = remoteFilters ? Number(serverPagination?.page || 1) : localPage;
  const visibleProperties = remoteFilters
    ? filteredProperties
    : filteredProperties.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const resultCount = remoteFilters
    ? Number(serverPagination?.total || filteredProperties.length)
    : filteredProperties.length;

  useEffect(() => {
    if (!remoteFilters && localPage > pageCount) setLocalPage(pageCount);
  }, [localPage, pageCount, remoteFilters]);

  const updateSearch = (value) => {
    if (remoteFilters) onSearchChange?.(value);
    else {
      setLocalSearch(value);
      setLocalPage(1);
    }
  };
  const updateSort = (value) => {
    if (remoteFilters) onSortChange?.(value);
    else {
      setLocalSort(value);
      setLocalPage(1);
    }
  };
  const updateMinimum = (value) => {
    if (remoteFilters) onMinPriceChange?.(value);
    else {
      setLocalMinPrice(value);
      setLocalPage(1);
    }
  };
  const updateMaximum = (value) => {
    if (remoteFilters) onMaxPriceChange?.(value);
    else {
      setLocalMaxPrice(value);
      setLocalPage(1);
    }
  };

  const renderActions = (property) => (
    <div className="area-property-card-actions">
      {canManageVerification && (
        <>
          <button
            type="button"
            className="admin-btn admin-btn-approve"
            disabled={actionLoading === property._id}
            onClick={() => onAction(property._id, 'verify')}
          >
            {t(actionLoading === property._id ? 'Working...' : 'Approve')}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-reject"
            disabled={actionLoading === property._id}
            onClick={(event) => {
              rejectionTriggerRef.current = event.currentTarget;
              setRejectionFeedback('');
              setRejectionProperty(property);
            }}
          >
            {t(actionLoading === property._id ? 'Working...' : 'Reject')}
          </button>
        </>
      )}
      <button
        type="button"
        className="admin-property-view-details"
        onClick={() => onViewDetails(property)}
      >
        {t('View details')}
      </button>
    </div>
  );

  const submitRejection = async (reason) => {
    const result = await onAction(rejectionProperty._id, 'reject', reason);
    if (result?.success === false) return result;
    setRejectionFeedback(t('Property rejected successfully.'));
    return { success: true };
  };

  const renderStatus = (property) => {
    const status = statusDetails[getStatus(property)];
    return (
      <span className={`admin-property-status-badge ${status.className}`}>
        {t(status.label)}
      </span>
    );
  };

  const renderCard = (property) => {
    const handlerSummary = getHandlerSummary(property, formatDate, t);
    return (
      <article key={property._id} className="admin-property-card area-property-card">
        <div className="admin-property-card-media">
          <PropertyImage
            src={getPropertyImages(property)}
            alt={property.title}
            className="admin-property-card-image"
            fallbackClassName="admin-property-card-image admin-property-image-placeholder"
            fallbackText={t('No property image available')}
          />
          {renderStatus(property)}
        </div>
        <div className="admin-property-card-content">
          <h3 className="admin-property-card-title" title={property.title}>{property.title}</h3>
          <p className="admin-property-location">
            {getLocation(property) || t('Location unavailable')}
          </p>
          <p className="admin-property-price">
            ETB {Number(property.price || 0).toLocaleString()} <span>{t('/ month')}</span>
          </p>
          <div className="area-property-card-meta">
            <span>{t('Bedrooms: {count}', { count: property.bedrooms ?? '—' })}</span>
            <span>{property.landlord?.name || t('Unknown Owner')}</span>
            <span>{t('Submitted: {date}', {
              date: property.createdAt
                ? formatDate(property.createdAt, { dateStyle: 'medium' })
                : t('Date unavailable'),
            })}</span>
            {handlerSummary && <span className="area-property-handler">{handlerSummary}</span>}
          </div>
        </div>
        {renderActions(property)}
      </article>
    );
  };

  return (
    <div className="area-property-list">
      {rejectionFeedback && (
        <p className="admin-success-banner" role="status" aria-live="polite">
          {rejectionFeedback}
        </p>
      )}
      <div className="admin-property-toolbar area-property-toolbar">
        <div className="admin-property-filters area-property-filters">
          <label>
            <span>{t('Search properties')}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder={t('Search title, landlord, or address')}
            />
          </label>
          <label>
            <span>{t('Sort')}</span>
            <select value={sort} onChange={(event) => updateSort(event.target.value)}>
              <option value="newest">{t('Newest')}</option>
              <option value="price-asc">{t('Price: low to high')}</option>
              <option value="price-desc">{t('Price: high to low')}</option>
            </select>
          </label>
          <label>
            <span>{t('Minimum price')}</span>
            <input type="number" min="0" value={minPrice} onChange={(event) => updateMinimum(event.target.value)} />
          </label>
          <label>
            <span>{t('Maximum price')}</span>
            <input type="number" min="0" value={maxPrice} onChange={(event) => updateMaximum(event.target.value)} />
          </label>
        </div>
        <div className="admin-property-toolbar-footer">
          <span className="admin-property-result-count">{resultCount} {t('results')}</span>
          <div className="admin-property-view-toggle" role="group" aria-label={t('Property view')}>
            <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{t('Grid')}</button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('List')}</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="area-property-skeleton-grid" role="status" aria-label={t('Loading properties...')}>
          {Array.from({ length: 6 }, (_, index) => (
            <div className="area-property-skeleton" key={index} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="admin-property-state" role="alert">{error}</div>
      ) : visibleProperties.length === 0 ? (
        <div className="admin-property-state">{t('No properties match your filters.')}</div>
      ) : view === 'grid' ? (
        <div className="admin-property-card-grid area-property-card-grid">
          {visibleProperties.map(renderCard)}
        </div>
      ) : (
        <div className="admin-property-list area-property-table">
          <div className="admin-property-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Property')}</th>
                  <th>{t('Location')}</th>
                  <th>{t('Price')}</th>
                  <th>{t('Landlord')}</th>
                  <th>{t('Submitted')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleProperties.map((property) => (
                  <tr key={property._id}>
                    <td>
                      <div className="admin-property-list-title">
                        <PropertyImage
                          src={getPropertyImages(property)}
                          alt={property.title}
                          className="admin-property-list-image"
                          fallbackClassName="admin-property-list-image admin-property-image-placeholder"
                          fallbackText={t('No image')}
                        />
                        <strong>{property.title}</strong>
                      </div>
                    </td>
                    <td>{getLocation(property) || t('Location unavailable')}</td>
                    <td className="admin-property-list-price">ETB {Number(property.price || 0).toLocaleString()} {t('/ month')}</td>
                    <td>{property.landlord?.name || t('Unknown Owner')}</td>
                    <td>{property.createdAt ? formatDate(property.createdAt, { dateStyle: 'medium' }) : t('Date unavailable')}</td>
                    <td>{renderStatus(property)}</td>
                    <td>{renderActions(property)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="area-property-mobile-list">
            {visibleProperties.map((property) => (
              <article key={property._id} className="area-property-mobile-row">
                <div className="admin-property-list-title">
                  <PropertyImage
                    src={getPropertyImages(property)}
                    alt={property.title}
                    className="admin-property-list-image"
                    fallbackClassName="admin-property-list-image admin-property-image-placeholder"
                    fallbackText={t('No image')}
                  />
                  <strong>{property.title}</strong>
                </div>
                {renderStatus(property)}
                <span>{getLocation(property) || t('Location unavailable')}</span>
                <strong>ETB {Number(property.price || 0).toLocaleString()} {t('/ month')}</strong>
                <span>{property.landlord?.name || t('Unknown Owner')}</span>
                <span>{property.createdAt ? formatDate(property.createdAt, { dateStyle: 'medium' }) : t('Date unavailable')}</span>
                {renderActions(property)}
              </article>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && pageCount > 1 && (
        <nav className="admin-pagination" aria-label={t('Property pagination')}>
          <button
            type="button"
            className="admin-btn"
            disabled={page <= 1}
            onClick={() => {
              if (remoteFilters) onPageChange?.(page - 1);
              else setLocalPage((current) => Math.max(1, current - 1));
            }}
          >
            {t('Previous')}
          </button>
          <span>{t('Page {current} of {total}', { current: page, total: pageCount })}</span>
          <button
            type="button"
            className="admin-btn"
            disabled={page >= pageCount}
            onClick={() => {
              if (remoteFilters) onPageChange?.(page + 1);
              else setLocalPage((current) => Math.min(pageCount, current + 1));
            }}
          >
            {t('Next')}
          </button>
        </nav>
      )}
      {rejectionProperty && (
        <RejectionReasonModal
          onClose={() => setRejectionProperty(null)}
          onSubmit={submitRejection}
          returnFocusRef={rejectionTriggerRef}
          loading={actionLoading === rejectionProperty._id}
        />
      )}
    </div>
  );
};

export default AreaPropertyList;
