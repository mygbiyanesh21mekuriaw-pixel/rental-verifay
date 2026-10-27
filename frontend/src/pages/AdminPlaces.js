import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BackToDashboard from '../components/BackToDashboard';
import { useLanguage } from '../context/LanguageContext';
import { apiUrl } from '../utils/apiUrl';

const getRequestError = (error, fallback) => {
  return error.response?.data?.message || error.message || fallback;
};
const emptyAddressMapping = { region: '', zone: '', wereda: '', city: '' };
const PAGE_SIZE = 10;

const formatPlaceName = (value = '') => value
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
  .join(' ');

const AdminPlaces = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [places, setPlaces] = useState([]);
  const [totals, setTotals] = useState({
    totalAreas: 0,
    areasWithAdmin: 0,
    areasWithoutAdmin: 0,
    unassignedProperties: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unassignedProperties, setUnassignedProperties] = useState([]);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [addressMapping, setAddressMapping] = useState(emptyAddressMapping);
  const [editingId, setEditingId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const addPlaceButtonRef = useRef(null);
  const formNameRef = useRef(null);
  const handledUnassignedProperty = useRef('');

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: token ? { Authorization: 'Bearer ' + token } : {} };
      const [areasResponse, unassignedResponse] = await Promise.all([
        axios.get(apiUrl('/api/areas?includeSummary=true'), config),
        axios.get(apiUrl('/api/areas/unassigned-properties'), config),
      ]);
      const result = areasResponse.data || {};
      setPlaces(Array.isArray(result.areas) ? result.areas : []);
      setTotals(result.totals || {
        totalAreas: 0,
        areasWithAdmin: 0,
        areasWithoutAdmin: 0,
        unassignedProperties: 0,
      });
      setUnassignedProperties(Array.isArray(unassignedResponse.data) ? unassignedResponse.data : []);
      setLoadError('');
    } catch (requestError) {
      console.error('Unable to load Ethiopia places:', requestError);
      setLoadError(getRequestError(requestError, 'Unable to load places.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  const resetForm = useCallback(() => {
    setEditingId('');
    setName('');
    setRegion('');
    setAddressMapping(emptyAddressMapping);
    setError('');
  }, []);

  const closeForm = useCallback(() => {
    if (saving) return;
    setFormOpen(false);
    resetForm();
    addPlaceButtonRef.current?.focus();
  }, [resetForm, saving]);

  useEffect(() => {
    if (!formOpen) return undefined;
    formNameRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) closeForm();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeForm, formOpen, saving]);

  useEffect(() => {
    const propertyId = new URLSearchParams(location.search).get('unassignedProperty');
    if (loading || !propertyId || handledUnassignedProperty.current === propertyId) return;
    const property = unassignedProperties.find((entry) => String(entry._id) === propertyId);
    if (!property) return;
    handledUnassignedProperty.current = propertyId;
    resetForm();
    setRegion(property.region || '');
    setAddressMapping({
      region: property.region || '',
      zone: property.zone || '',
      wereda: property.wereda || '',
      city: property.city || '',
    });
    setFormOpen(true);
    navigate(location.pathname, { replace: true });
  }, [loading, location.pathname, location.search, navigate, resetForm, unassignedProperties]);

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const handleEdit = (place) => {
    resetForm();
    setEditingId(place._id);
    setName(place.name || '');
    setRegion(place.region || '');
    setAddressMapping({ ...emptyAddressMapping, ...(place.addressMapping || {}) });
    setFormOpen(true);
    setOpenMenuId('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!Object.values(addressMapping).some((value) => value.trim())) {
      setError(t('At least one address matching rule is required.'));
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const token = localStorage.getItem('token');
    const config = { headers: token ? { Authorization: 'Bearer ' + token } : {} };
    try {
      const response = editingId
        ? await axios.put(apiUrl(`/api/areas/${editingId}`), { name, region, addressMapping }, config)
        : await axios.post(apiUrl('/api/areas'), { name, region, addressMapping }, config);
      setMessage(response.data?.message || t(editingId ? 'Place updated successfully.' : 'Place added successfully.'));
      setFormOpen(false);
      resetForm();
      addPlaceButtonRef.current?.focus();
      await fetchPlaces();
    } catch (requestError) {
      console.error('Unable to save Ethiopia place:', requestError);
      setError(getRequestError(requestError, editingId ? 'Unable to update place.' : 'Unable to add place.'));
      if (requestError.response?.data?.conflictingArea) {
        setError(`${getRequestError(requestError, 'Unable to save place.')} ${t('Conflicts with: {area}')
          .replace('{area}', requestError.response.data.conflictingArea)}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (place, isActive) => {
    setOpenMenuId('');
    setError('');
    setMessage('');
    const token = localStorage.getItem('token');
    try {
      const response = await axios.patch(apiUrl(`/api/areas/${place._id}/status`), { isActive }, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      setMessage(response.data?.message || t(isActive ? 'Place enabled successfully.' : 'Place disabled successfully.'));
      await fetchPlaces();
    } catch (requestError) {
      console.error('Unable to update Ethiopia place status:', requestError);
      const conflict = requestError.response?.data?.conflictingArea;
      setError(`${getRequestError(requestError, 'Unable to update place status.')}${conflict ? ` ${t('Conflicts with: {area}').replace('{area}', conflict)}` : ''}`);
    }
  };

  const handleDelete = async (place) => {
    setOpenMenuId('');
    if (!window.confirm(`${t('Delete')} ${place.name}?`)) return;
    setError('');
    setMessage('');
    const token = localStorage.getItem('token');
    try {
      const response = await axios.delete(apiUrl(`/api/areas/${place._id}`), {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      setMessage(response.data?.message || t('Place deleted successfully.'));
      await fetchPlaces();
    } catch (requestError) {
      console.error('Unable to delete Ethiopia place:', requestError);
      setError(getRequestError(requestError, 'Unable to delete place.'));
    }
  };

  const filteredPlaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    return places.filter((place) => {
      const matchingText = [
        place.name,
        place.region,
        place.areaAdmin?.name,
        ...Object.values(place.addressMapping || {}),
      ].join(' ').toLowerCase().includes(query);
      const statusMatches = statusFilter === 'all'
        || (statusFilter === 'disabled' && place.isActive === false)
        || (statusFilter === 'has-admin' && place.isActive !== false && place.activeAdminCount > 0)
        || (statusFilter === 'no-admin' && place.isActive !== false && place.activeAdminCount === 0);
      return matchingText && statusMatches;
    });
  }, [places, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredPlaces.length / PAGE_SIZE));
  const visiblePlaces = filteredPlaces.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const addressFields = Object.keys(emptyAddressMapping);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  return (
    <div className="admin-container admin-section-page admin-places-page">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">{t('Ethiopia Places')}</span>
            </h1>
            <p className="admin-subtitle">{t('Manage Ethiopia places')}</p>
          </div>
          <button
            ref={addPlaceButtonRef}
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={openNewForm}
          >
            + {t('Add Place')}
          </button>
        </div>
      </div>

      {error && !formOpen && <p className="admin-places-feedback is-error" role="alert">{t(error)}</p>}
      {loadError && <p className="admin-places-feedback is-error" role="alert">{t(loadError)}</p>}
      {message && <p className="admin-places-feedback" role="status">{t(message)}</p>}

      {!loading && unassignedProperties.length > 0 && (
        <section className="admin-places-unassigned" aria-labelledby="admin-places-unassigned-title">
          <div className="admin-places-unassigned-heading">
            <div>
              <h2 id="admin-places-unassigned-title">{t('Properties without an assigned area')}</h2>
              <p>{t('{count} properties need an address mapping.').replace('{count}', String(unassignedProperties.length))}</p>
            </div>
            <span className="admin-places-count-badge">{unassignedProperties.length}</span>
          </div>
          <ul className="admin-places-unassigned-list">
            {unassignedProperties.map((property) => (
              <li key={property._id}>
                <div>
                  <strong>{property.title || t('Untitled property')}</strong>
                  <span>{[property.city, property.zone, property.wereda, property.region, property.location]
                    .filter(Boolean)
                    .join(', ') || t('Address unavailable')}</span>
                </div>
                <Link
                  className="admin-places-fix-link"
                  to={`/admin-dashboard/places?unassignedProperty=${encodeURIComponent(property._id)}`}
                >
                  {t('Create matching area')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="admin-places-summary" aria-label={t('Area summary')}>
        {[
          ['Total areas', totals.totalAreas, 'is-violet'],
          ['Areas with an Area Admin', totals.areasWithAdmin, 'is-green'],
          ['Areas without an admin', totals.areasWithoutAdmin, 'is-amber'],
          ['Properties waiting/unassigned', totals.unassignedProperties, 'is-blue'],
        ].map(([label, value, color]) => (
          <div key={label} className={`admin-places-summary-card ${color}`}>
            <span>{t(label)}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="admin-detail-section admin-dedicated-content admin-management-panel admin-places-panel">
        <div className="admin-places-toolbar">
          <label>
            <span>{t('Search areas')}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('Search by area, region, matching rule, or admin')}
            />
          </label>
          <label>
            <span>{t('Filter areas by status')}</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">{t('All statuses')}</option>
              <option value="has-admin">{t('Has admin')}</option>
              <option value="no-admin">{t('No admin')}</option>
              <option value="disabled">{t('Disabled')}</option>
            </select>
          </label>
          <p className="admin-result-count">
            {t('Area results: {count}').replace('{count}', String(filteredPlaces.length))}
          </p>
        </div>

        {loading ? (
          <div className="admin-loading-small">{t('Loading places...')}</div>
        ) : filteredPlaces.length === 0 ? (
          <div className="admin-empty-text">
            {places.length ? t('No areas match your filters.') : t('No places registered yet')}
          </div>
        ) : (
          <>
            <div className="admin-area-admin-table-wrap admin-places-table-wrap">
              <table className="admin-area-admin-table admin-places-table">
                <thead>
                  <tr>
                    <th scope="col">{t('Area')}</th>
                    <th scope="col">{t('Region')}</th>
                    <th scope="col">{t('Matching rules')}</th>
                    <th scope="col">{t('Area Admin')}</th>
                    <th scope="col">{t('Properties')}</th>
                    <th scope="col">{t('Status')}</th>
                    <th scope="col">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlaces.map((place) => {
                    const hasAdmin = place.activeAdminCount > 0;
                    const disabled = place.isActive === false;
                    const canDelete = !place.propertyCount && !place.adminCount && !place.historyCount;
                    const matchingRules = Object.entries(place.addressMapping || {}).filter(([, value]) => value);
                    return (
                      <tr key={place._id} className="admin-area-admin-row admin-places-row">
                        <td data-label={t('Area')} className="admin-places-area-name">
                          <strong>{place.name}</strong>
                          {place.hasNoActiveAdminWithWaitingItems && (
                            <span className="admin-area-warning-badge" role="status">
                              {t('Area {area} has no active Area Admin; {count} items are waiting.')
                                .replace('{area}', place.name)
                                .replace('{count}', String(place.waitingItemCount))}
                            </span>
                          )}
                        </td>
                        <td data-label={t('Region')}>{formatPlaceName(place.region || '') || '—'}</td>
                        <td data-label={t('Matching rules')}>
                          <div className="admin-places-rule-chips">
                            {matchingRules.length ? matchingRules.map(([field, value]) => (
                              <span key={field}>{t(field[0].toUpperCase() + field.slice(1))}: {value}</span>
                            )) : <span>—</span>}
                          </div>
                        </td>
                        <td data-label={t('Area Admin')}>
                          {place.areaAdmin
                            ? (
                              <span className="admin-places-admin-detail">
                                {place.areaAdmin.name}
                                {place.areaAdmin.isActive === false && (
                                  <small className="admin-places-inactive-admin">{t('Inactive')}</small>
                                )}
                              </span>
                            )
                            : <span className="admin-places-no-admin">{t('None')}</span>}
                          {!hasAdmin && !disabled && !place.adminCount && (
                            <Link
                              className="admin-places-assign-link"
                              to={`/admin-dashboard/admin-management?assignArea=${encodeURIComponent(place.name)}`}
                            >
                              {t('Assign admin')}
                            </Link>
                          )}
                        </td>
                        <td data-label={t('Properties')}>
                          <span className="admin-places-property-count">{place.propertyCount || 0}</span>
                          <small>{t('{count} waiting').replace('{count}', String(place.waitingPropertyCount || 0))}</small>
                        </td>
                        <td data-label={t('Status')}>
                          <span className={`admin-status-badge ${disabled ? 'is-inactive' : hasAdmin ? 'is-active' : 'admin-places-status-no-admin'}`}>
                            {t(disabled ? 'Disabled' : hasAdmin ? 'Has admin' : 'No admin')}
                          </span>
                        </td>
                        <td data-label={t('Actions')} className="admin-places-actions-cell">
                          <div className="admin-action-menu">
                            <button
                              type="button"
                              className="admin-action-menu-trigger"
                              aria-label={t('More actions')}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === place._id}
                              aria-controls={`area-place-menu-${place._id}`}
                              onClick={() => setOpenMenuId((current) => current === place._id ? '' : place._id)}
                            >
                              <span aria-hidden="true">⋮</span>
                            </button>
                            {openMenuId === place._id && (
                              <div
                                id={`area-place-menu-${place._id}`}
                                className="admin-action-menu-panel admin-places-action-menu"
                                role="menu"
                                aria-label={t('Actions for {name}').replace('{name}', place.name)}
                                onKeyDown={(event) => {
                                  const items = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]'));
                                  const index = items.indexOf(document.activeElement);
                                  if (event.key === 'Escape') {
                                    setOpenMenuId('');
                                    return;
                                  }
                                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    const next = event.key === 'ArrowDown'
                                      ? (index + 1) % items.length
                                      : (index - 1 + items.length) % items.length;
                                    items[next]?.focus();
                                  }
                                }}
                              >
                                <button type="button" role="menuitem" onClick={() => handleEdit(place)}>{t('Edit')}</button>
                                <button type="button" role="menuitem" onClick={() => handleSetActive(place, disabled)}>
                                  {t(disabled ? 'Enable' : 'Disable')}
                                </button>
                                {canDelete && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="is-destructive"
                                    onClick={() => handleDelete(place)}
                                  >
                                    {t('Delete')}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredPlaces.length > PAGE_SIZE && (
              <nav className="admin-pagination" aria-label={t('Area pagination')}>
                <button type="button" className="admin-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  {t('Previous')}
                </button>
                <span>{t('Page {current} of {total}').replace('{current}', String(page)).replace('{total}', String(pageCount))}</span>
                <button type="button" className="admin-btn" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                  {t('Next')}
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      {formOpen && createPortal(
        <div
          className="admin-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="admin-form-modal admin-place-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-place-modal-title"
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const focusable = Array.from(event.currentTarget.querySelectorAll(
                'button:not(:disabled), input:not(:disabled), a[href], select:not(:disabled), textarea:not(:disabled)',
              ));
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <div className="admin-modal-header">
              <h2 id="admin-place-modal-title" className="admin-card-title">
                {t(editingId ? 'Edit Place' : 'Add Place')}
              </h2>
              <button type="button" className="admin-modal-close" aria-label={t('Close')} onClick={closeForm} disabled={saving}>×</button>
            </div>
            <form id="admin-place-form" className="admin-place-form" onSubmit={handleSubmit} autoComplete="off">
              <div className="admin-place-form-body">
                {error && <p className="admin-places-feedback is-error" role="alert">{t(error)}</p>}
                <fieldset>
                  <legend>{t('Place')}</legend>
                  <label>
                    <span>{t('Place name')} *</span>
                    <input
                      ref={formNameRef}
                      name="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={120}
                      required
                    />
                  </label>
                  <label>
                    <span>{t('Region')}</span>
                    <input
                      name="region"
                      value={region}
                      onChange={(event) => setRegion(event.target.value)}
                      maxLength={120}
                    />
                  </label>
                </fieldset>
                <fieldset>
                  <legend>{t('Address matching rules')}</legend>
                  <p>{t('A property is matched to an area when every value you enter below matches its address. Use at least one rule; active areas cannot have overlapping rules.')}</p>
                  <div className="admin-place-rule-fields">
                    {addressFields.map((field) => (
                      <label key={field}>
                        <span>{t(`Match ${field[0].toUpperCase()}${field.slice(1)}`)}</span>
                        <input
                          name={`addressMapping.${field}`}
                          value={addressMapping[field]}
                          onChange={(event) => setAddressMapping((previous) => ({
                            ...previous,
                            [field]: event.target.value,
                          }))}
                          maxLength={120}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <footer className="admin-form-modal-actions">
                <button type="button" onClick={closeForm} className="admin-btn" disabled={saving}>{t('Cancel')}</button>
                <button type="submit" disabled={saving} className="admin-btn admin-btn-primary">
                  {saving ? t('Saving...') : t(editingId ? 'Save Place' : 'Add Place')}
                </button>
              </footer>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default AdminPlaces;
