import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import BackToDashboard from '../components/BackToDashboard';
import { useLanguage } from '../context/LanguageContext';
import { apiUrl } from '../utils/apiUrl';

const getRequestError = (error, fallback) => {
  const status = error.response?.status;
  const message = error.response?.data?.message || error.message || fallback;
  return `${status ? `HTTP ${status}: ` : ''}${message}`;
};
const emptyAddressMapping = { region: '', zone: '', wereda: '', city: '' };

const AdminPlaces = () => {
  const { t } = useLanguage();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unassignedProperties, setUnassignedProperties] = useState([]);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [addressMapping, setAddressMapping] = useState(emptyAddressMapping);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: token ? { Authorization: `Bearer ${token}` } : {} };
      const [areasResponse, unassignedResponse] = await Promise.all([
        axios.get(apiUrl('/api/areas'), config),
        axios.get(apiUrl('/api/areas/unassigned-properties'), config),
      ]);
      setPlaces(Array.isArray(areasResponse.data) ? areasResponse.data : []);
      setUnassignedProperties(Array.isArray(unassignedResponse.data) ? unassignedResponse.data : []);
      setError('');
    } catch (requestError) {
      console.error('Unable to load Ethiopia places:', requestError);
      setError(getRequestError(requestError, 'Unable to load places.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  const resetForm = () => {
    setEditingId('');
    setName('');
    setRegion('');
    setAddressMapping(emptyAddressMapping);
  };

  const handleEdit = (place) => {
    setEditingId(place._id);
    setName(place.name || '');
    setRegion(place.region || '');
    setAddressMapping({ ...emptyAddressMapping, ...(place.addressMapping || {}) });
    setError('');
    setMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const token = localStorage.getItem('token');
    const config = { headers: token ? { Authorization: `Bearer ${token}` } : {} };
    try {
      const response = editingId
        ? await axios.put(apiUrl(`/api/areas/${editingId}`), { name, region, addressMapping }, config)
        : await axios.post(apiUrl('/api/areas'), { name, region, addressMapping }, config);
      setMessage(response.data?.message || t(editingId ? 'Place updated successfully.' : 'Place added successfully.'));
      resetForm();
      await fetchPlaces();
    } catch (requestError) {
      console.error('Unable to save Ethiopia place:', requestError);
      setError(getRequestError(requestError, editingId ? 'Unable to update place.' : 'Unable to add place.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (place) => {
    if (!window.confirm(`${t('Delete')} ${place.name}?`)) return;
    setError('');
    setMessage('');
    const token = localStorage.getItem('token');
    try {
      const response = await axios.delete(apiUrl(`/api/areas/${place._id}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setMessage(response.data?.message || t('Place deleted successfully.'));
      if (editingId === place._id) resetForm();
      await fetchPlaces();
    } catch (requestError) {
      console.error('Unable to delete Ethiopia place:', requestError);
      setError(getRequestError(requestError, 'Unable to delete place.'));
    }
  };

  return (
    <div className="admin-container admin-section-page">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">{t('Ethiopia Places')}</span>
            </h1>
            <p className="admin-subtitle">{t('Manage Ethiopia places')}</p>
          </div>
        </div>
      </div>

      <section className="admin-detail-section admin-dedicated-content admin-management-panel">
        <h2 className="admin-card-title">{t(editingId ? 'Edit Place' : 'Add Place')}</h2>
        {error && <p className="admin-empty-text" role="alert">{t(error)}</p>}
        {message && <p className="admin-empty-text" role="status">{t(message)}</p>}
        <form onSubmit={handleSubmit} className="admin-grid" autoComplete="off">
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('Place name')}
            maxLength={120}
            required
            className="admin-card-detail"
          />
          <input
            name="region"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder={t('Region (optional)')}
            maxLength={120}
            className="admin-card-detail"
          />
          <h3 className="admin-card-title">{t('Property address mapping')}</h3>
          {Object.keys(emptyAddressMapping).map((field) => (
            <input
              key={field}
              name={`addressMapping.${field}`}
              value={addressMapping[field]}
              onChange={(event) => setAddressMapping((previous) => ({ ...previous, [field]: event.target.value }))}
              placeholder={t(`Match ${field[0].toUpperCase()}${field.slice(1)} (optional)`)}
              maxLength={120}
              className="admin-card-detail"
            />
          ))}
          <button type="submit" disabled={saving} className="admin-btn admin-btn-primary">
            {saving ? t('Saving...') : t(editingId ? 'Save Place' : 'Add Place')}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="admin-btn">
              {t('Cancel')}
            </button>
          )}
        </form>
      </section>

      <section className="admin-detail-section admin-dedicated-content admin-management-panel">
        <h2 className="admin-card-title">{t('Ethiopia Places')}</h2>
        {loading ? (
          <div className="admin-loading-small">{t('Loading places...')}</div>
        ) : places.length === 0 ? (
          <div className="admin-empty-text">{t('No places registered yet')}</div>
        ) : (
          <div className="admin-grid">
            {places.map((place) => (
              <div key={place._id} className="admin-card">
                <h3 className="admin-card-title">{place.name}</h3>
                {place.region && <p className="admin-card-detail">{t('Region')}: {place.region}</p>}
                {Object.entries(place.addressMapping || {}).some(([, value]) => value) && (
                  <p className="admin-card-detail">
                    {t('Matches')}: {Object.entries(place.addressMapping)
                      .filter(([, value]) => value)
                      .map(([field, value]) => `${t(field[0].toUpperCase() + field.slice(1))}: ${value}`)
                      .join(', ')}
                  </p>
                )}
                {place.hasNoActiveAdminWithWaitingItems && (
                  <p className="admin-area-warning-badge" role="status">
                    {t('Area {area} has no active Area Admin; {count} items are waiting.')
                      .replace('{area}', place.name)
                      .replace('{count}', String(place.waitingItemCount))}
                  </p>
                )}
                <div className="admin-card-actions">
                  <button type="button" onClick={() => handleEdit(place)} className="admin-btn admin-management-edit-btn">
                    {t('Edit')}
                  </button>
                  <button type="button" onClick={() => handleDelete(place)} className="admin-btn admin-management-delete-btn">
                    {t('Delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="admin-detail-section admin-dedicated-content admin-management-panel">
        <h2 className="admin-card-title">{t('Properties without an assigned area')}</h2>
        {unassignedProperties.length === 0 ? (
          <p className="admin-empty-text">{t('No properties are waiting for an area assignment.')}</p>
        ) : (
          <ul className="admin-grid" aria-label={t('Properties without an assigned area')}>
            {unassignedProperties.map((property) => (
              <li key={property._id} className="admin-card">
                <h3 className="admin-card-title">{property.title}</h3>
                <p className="admin-card-detail">{property.location}</p>
                <p className="admin-area-warning-badge" role="status">{t('Address mapping required')}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AdminPlaces;
