import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './adminDashboard.css';

const sectionConfig = {
  awaitingVerification: { title: '⏳ Properties awaiting verification', endpoint: 'pending-properties' },
  allProperties: { title: '📊 All properties', status: 'all' },
  pending: { title: '⏳ Pending properties', status: 'pending' },
  rejected: { title: '❌ Rejected properties', status: 'rejected' },
  allUsers: { title: '👤 All users', endpoint: 'users' },
  adminManagement: { title: '🛡️ Admin Management', endpoint: 'users' },
  verified: { title: '✅ Verified properties', status: 'approved' },
};

const adminAreaOptions = [
  { label: 'Addis Ababa', value: 'Addis Ababa' },
  { label: 'Amhara', value: 'amhara' },
  { label: 'Oromia', value: 'oromiya' },
];

const displayVerificationStatus = (property) => {
  if (property.isVerified && property.verificationStatus === 'approved') return 'Verified';
  if (!property.isVerified && property.verificationStatus === 'rejected') return 'Rejected';
  if (!property.isVerified && property.verificationStatus === 'pending') return 'Under Review';
  return property.verificationStatus || 'Unknown';
};

const AdminSectionPage = ({ type }) => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const config = sectionConfig[type];
  const isAdminManagementPage = type === 'adminManagement';
  const isUserListPage = type === 'allUsers';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    adminType: 'area',
    area: '',
  });
  const [adminFormError, setAdminFormError] = useState('');
  const [adminFormMessage, setAdminFormMessage] = useState('');
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [adminActionLoading, setAdminActionLoading] = useState(null);
  const isPlatformAdmin = currentUser?.role === 'admin'
    && (!currentUser.adminType || currentUser.adminType === 'platform');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      let endpoint = config.endpoint
        ? `http://localhost:5000/api/admin/${config.endpoint}`
        : `http://localhost:5000/api/admin/properties?status=${config.status}`;

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const records = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.properties) ? response.data.properties : [];
      setItems(isAdminManagementPage
        ? records.filter(user => user && user._id != null && user.role === 'admin' && user.adminType === 'area')
        : records.filter(property => property && property._id != null));
    } catch (error) {
      console.error('Error fetching admin section:', error);
      setItems([]);
      setLoadError(error.response?.data?.message || 'Unable to load admin records.');
    } finally {
      setLoading(false);
    }
  }, [config, type, isAdminManagementPage]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handlePropertyAction = async (propertyId, action) => {
    setActionLoading(propertyId);
    const endpoint = `http://localhost:5000/api/admin/${action}-property/${propertyId}`;
    const payload = action === 'reject' ? { comment: 'Documentation insufficient' } : {};
    console.info('Admin property action', { method: 'PUT', endpoint, propertyId, payload });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } });
      console.info('Admin property action succeeded', { method: 'PUT', endpoint, propertyId, status: response.status });
      await fetchItems();
    } catch (error) {
      const status = error.response?.status || 'no response';
      const message = error.response?.data?.message || error.message || 'Unable to update property';
      console.error('Admin property action failed', { method: 'PUT', endpoint, propertyId, payload, status, message });
      alert(`${message} (HTTP ${status})`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdminFormChange = (event) => {
    const { name, value } = event.target;
    setAdminForm((current) => ({ ...current, [name]: value }));
  };

  const handleEditAdmin = (admin) => {
    setEditingAdminId(admin._id);
    setAdminForm({
      name: admin.name || '',
      email: admin.email || '',
      phone: admin.phone || '',
      password: '',
      adminType: 'area',
      area: admin.adminAreas?.[0]?.region || '',
    });
    setAdminFormError('');
    setAdminFormMessage('');
  };

  const handleCancelAdminEdit = () => {
    setEditingAdminId(null);
    setAdminForm({ name: '', email: '', phone: '', password: '', adminType: 'area', area: '' });
    setAdminFormError('');
    setAdminFormMessage('');
  };

  const handleAdminSubmit = async (event) => {
    event.preventDefault();
    setAdminFormError('');
    setAdminFormMessage('');
    setAdminFormLoading(true);
    try {
      const payload = {
        name: adminForm.name,
        email: adminForm.email,
        phone: adminForm.phone,
        adminType: 'area',
        adminAreas: [{ region: adminForm.area }],
      };
      if (!editingAdminId) payload.password = adminForm.password;
      const token = localStorage.getItem('token');
      const endpoint = editingAdminId
        ? `http://localhost:5000/api/admin/users/admin/${editingAdminId}`
        : 'http://localhost:5000/api/admin/users/admin';
      const response = editingAdminId
        ? await axios.put(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } })
        : await axios.post(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } });
      const successMessage = response.data?.message || (editingAdminId
        ? 'Area Admin updated successfully.'
        : 'Admin account created successfully.');
      handleCancelAdminEdit();
      setAdminFormMessage(successMessage);
      await fetchItems();
    } catch (error) {
      setAdminFormError(error.response?.data?.message || 'Unable to create admin account.');
    } finally {
      setAdminFormLoading(false);
    }
  };

  const handleDeleteAdmin = async (admin) => {
    const confirmed = window.confirm(
      `Delete Area Admin ${admin.name} (${admin.email})? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setAdminActionLoading(admin._id);
    setAdminFormError('');
    setAdminFormMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`http://localhost:5000/api/admin/users/admin/${admin._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAdminFormMessage(response.data?.message || 'Area Admin deleted successfully.');
      if (editingAdminId === admin._id) handleCancelAdminEdit();
      await fetchItems();
    } catch (error) {
      setAdminFormError(error.response?.data?.message || 'Unable to delete Area Admin.');
    } finally {
      setAdminActionLoading(null);
    }
  };

  if (!config) return null;

  return (
    <div className="admin-container admin-section-page">
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">{config.title}</span>
            </h1>
            <p className="admin-subtitle">Admin management</p>
          </div>
          <button
            type="button"
            className="admin-close-btn admin-back-dashboard"
            onClick={() => navigate('/admin-dashboard')}
          >
            ← Back to Admin Dashboard
          </button>
        </div>
      </div>

      {isAdminManagementPage && isPlatformAdmin && (
        <section className="admin-detail-section admin-dedicated-content">
          <h2 className="admin-card-title">{editingAdminId ? 'Edit Area Admin' : 'Create Area Admin Account'}</h2>
          <p className="admin-subtitle">Only the Platform Admin can create area-specific admin accounts.</p>
          {adminFormError && <div className="admin-empty-text">{adminFormError}</div>}
          {adminFormMessage && <div className="admin-empty-text">{adminFormMessage}</div>}
          <form onSubmit={handleAdminSubmit} className="admin-grid">
            <input name="name" value={adminForm.name} onChange={handleAdminFormChange} placeholder="Full name" required className="admin-card-detail" />
            <input name="email" type="email" value={adminForm.email} onChange={handleAdminFormChange} placeholder="Email" required className="admin-card-detail" />
            <input name="phone" value={adminForm.phone} onChange={handleAdminFormChange} placeholder="Phone" className="admin-card-detail" />
            {!editingAdminId && <input name="password" type="password" value={adminForm.password} onChange={handleAdminFormChange} placeholder="Password" minLength="6" required className="admin-card-detail" />}
            <select name="area" value={adminForm.area} onChange={handleAdminFormChange} required className="admin-card-detail">
              <option value="" disabled>Select area</option>
              {adminAreaOptions.map((area) => (
                <option key={area.value} value={area.value}>{area.label}</option>
              ))}
            </select>
            <div className="admin-card-detail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Admin Type: <strong style={{ marginLeft: 8 }}>Area Admin</strong>
            </div>
            <button type="submit" disabled={adminFormLoading} className="admin-btn admin-btn-primary">
              {adminFormLoading ? 'Saving...' : editingAdminId ? 'Save Changes' : 'Create Admin'}
            </button>
            {editingAdminId && <button type="button" onClick={handleCancelAdminEdit} className="admin-btn">Cancel</button>}
          </form>
        </section>
      )}

      {isAdminManagementPage && isPlatformAdmin && (
        <section className="admin-detail-section admin-dedicated-content">
          <h2 className="admin-card-title">Area Admins</h2>
          {loading ? (
            <div className="admin-loading-small">⏳ Loading...</div>
          ) : loadError ? (
            <div className="admin-empty-text">{loadError}</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">No Area Admins found.</div>
          ) : (
            <div className="admin-grid">
              {items.map((admin) => (
                <div key={admin._id} className="admin-card">
                  <h4 className="admin-card-title">👤 {admin.name}</h4>
                  <p className="admin-card-detail">📧 {admin.email}</p>
                  {admin.phone && <p className="admin-card-detail">📱 {admin.phone}</p>}
                  <p className="admin-card-detail">📍 Area: {admin.adminAreas?.[0]?.region || 'Unassigned'}</p>
                  <div className="admin-card-actions">
                    <button type="button" onClick={() => handleEditAdmin(admin)} className="admin-btn admin-btn-primary">Edit</button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAdmin(admin)}
                      disabled={adminActionLoading === admin._id}
                      className="admin-btn admin-btn-reject"
                    >
                      {adminActionLoading === admin._id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!isAdminManagementPage && (
        <section className="admin-detail-section admin-dedicated-content">
          {loading ? (
            <div className="admin-loading-small">⏳ Loading...</div>
          ) : loadError ? (
            <div className="admin-empty-text">{loadError}</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">No records found.</div>
          ) : isUserListPage ? (
            <div className="admin-grid">
              {items.map(user => (
                <div key={user._id} className="admin-card">
                  <h4 className="admin-card-title">👤 {user.name}</h4>
                  <p className="admin-card-detail">📧 {user.email}</p>
                  <p className="admin-card-detail">🎯 Role: {user.role}</p>
                  <p className="admin-card-detail">📱 {user.phone || 'No phone provided'}</p>
                  {user.role === 'admin' && (
                    <p className="admin-card-detail">
                      🛡️ {user.adminType || 'platform'}{user.adminAreas?.length ? `: ${user.adminAreas.map(area => area.city || area.region || area.zone).filter(Boolean).join(', ')}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-grid">
              {items.map(property => (
                <div key={property._id} className="admin-card">
                  {property.images?.[0] && <img src={property.images[0]} alt={property.title} className="admin-card-image" />}
                  <h4 className="admin-card-title">{property.title}</h4>
                  <p className="admin-card-detail">📍 {property.location}</p>
                  <p className="admin-card-price">💰 ETB {Number(property.price).toLocaleString()}</p>
                  <p className="admin-card-detail">🚪 Bedrooms: {property.bedrooms}</p>
                  <p className="admin-card-detail">👤 Landlord: {property.landlord?.name || 'Unknown Owner'}</p>
                  <p className="admin-card-detail">📝 {property.description || 'No description provided'}</p>
                  <p className="admin-card-detail">📅 Submitted: {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : 'Date unavailable'}</p>
                  <p className="admin-card-detail">
                    📌 Status: {displayVerificationStatus(property)}
                  </p>
                  {property.verificationDocument && (
                    <div className="admin-card-detail">
                      <strong>📄 Proof of Ownership</strong>
                      <img
                        src={property.verificationDocument}
                        alt={`Proof of ownership for ${property.title}`}
                        className="admin-card-image"
                      />
                    </div>
                  )}
                  {(type === 'awaitingVerification' || type === 'allProperties') && (
                    <div className="admin-card-actions">
                      <button
                        type="button"
                        onClick={() => handlePropertyAction(property._id, 'verify')}
                        disabled={actionLoading === property._id}
                        className="admin-btn admin-btn-approve"
                      >
                        {actionLoading === property._id ? 'Working...' : '✅ Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePropertyAction(property._id, 'reject')}
                        disabled={actionLoading === property._id}
                        className="admin-btn admin-btn-reject"
                      >
                        {actionLoading === property._id ? 'Working...' : '❌ Reject'}
                      </button>
                    </div>
                  )}
                  {type !== 'awaitingVerification' && property._id && (
                    <Link to={`/property/${property._id}`} className="admin-card-link">👁️ View details</Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default AdminSectionPage;
