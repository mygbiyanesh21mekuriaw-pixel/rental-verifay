import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import './adminDashboard.css';

const AdminRentalRequestDetail = () => {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  // ===== Fetch Rental Request Details =====
  useEffect(() => {
    const fetchRequestDetails = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `http://localhost:5000/api/admin/rental-requests/${requestId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setRequest(response.data);
      } catch (err) {
        console.error('Error fetching rental request details:', err);
        setError(err.response?.data?.message || 'Unable to load rental request details.');
      } finally {
        setLoading(false);
      }
    };

    if (requestId) {
      fetchRequestDetails();
    }
  }, [requestId]);

  // ===== Handle Approve =====
  const handleApprove = async () => {
    if (!window.confirm('Are you sure you want to approve this rental request?')) {
      return;
    }

    setActionLoading('approve');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `http://localhost:5000/api/rent-requests/${requestId}/status`,
        { status: 'approved' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.info('Rental request approved', { requestId, status: response.status });
      // Return to rental requests list
      navigate('/admin-dashboard/rental-requests', { 
        state: { message: 'Rental request approved successfully' } 
      });
    } catch (err) {
      console.error('Error approving rental request:', err);
      setError(err.response?.data?.message || 'Failed to approve rental request.');
    } finally {
      setActionLoading(null);
    }
  };

  // ===== Handle Reject =====
  const handleReject = async () => {
    if (!window.confirm('Are you sure you want to reject this rental request?')) {
      return;
    }

    setActionLoading('reject');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `http://localhost:5000/api/rent-requests/${requestId}/status`,
        { status: 'rejected' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.info('Rental request rejected', { requestId, status: response.status });
      // Return to rental requests list
      navigate('/admin-dashboard/rental-requests', { 
        state: { message: 'Rental request rejected successfully' } 
      });
    } catch (err) {
      console.error('Error rejecting rental request:', err);
      setError(err.response?.data?.message || 'Failed to reject rental request.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="admin-container admin-section-page">
        <div className="admin-loading-small">⏳ Loading rental request details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-container admin-section-page">
        <div className="admin-header">
          <div className="admin-title-wrapper">
            <div>
              <h1 className="admin-title">
                <span className="admin-title-gradient">📋 Rental Request Details</span>
              </h1>
            </div>
            <button
              type="button"
              className="admin-close-btn admin-back-dashboard"
              onClick={() => navigate('/admin-dashboard/rental-requests')}
            >
              ← Back to Rental Requests
            </button>
          </div>
        </div>
        <div className="admin-detail-section">
          <div className="admin-empty-text">{error}</div>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="admin-container admin-section-page">
        <div className="admin-header">
          <div className="admin-title-wrapper">
            <div>
              <h1 className="admin-title">
                <span className="admin-title-gradient">📋 Rental Request Details</span>
              </h1>
            </div>
            <button
              type="button"
              className="admin-close-btn admin-back-dashboard"
              onClick={() => navigate('/admin-dashboard/rental-requests')}
            >
              ← Back to Rental Requests
            </button>
          </div>
        </div>
        <div className="admin-detail-section">
          <div className="admin-empty-text">Rental request not found.</div>
        </div>
      </div>
    );
  }

  const property = request.property || {};
  const tenant = request.tenant || {};
  const landlord = request.landlord || {};

  return (
    <div className="admin-container admin-section-page">
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">📋 Rental Request Details</span>
            </h1>
            <p className="admin-subtitle">Review complete information before approval/rejection</p>
          </div>
          <button
            type="button"
            className="admin-close-btn admin-back-dashboard"
            onClick={() => navigate('/admin-dashboard/rental-requests')}
          >
            ← Back to Rental Requests
          </button>
        </div>
      </div>

      <section className="admin-detail-section admin-rental-request-details">
        {/* ===== REQUEST STATUS BADGE ===== */}
        <div className="admin-request-status-section">
          <span className={`admin-request-status-badge status-${request.status}`}>
            {request.status === 'pending' && '⏳ Pending'}
            {request.status === 'approved' && '✅ Approved'}
            {request.status === 'confirmed' && '✅ Confirmed'}
            {request.status === 'rejected' && '❌ Rejected'}
            {request.status === 'expired' && '⏰ Expired'}
          </span>
          <span className="admin-request-id">Request ID: {requestId}</span>
          <span className="admin-request-date">
            Submitted: {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'N/A'}
          </span>
        </div>

        {/* ===== PROPERTY INFORMATION ===== */}
        <div className="admin-request-section">
          <h3 className="admin-request-section-title">🏠 Property Information</h3>
          <div className="admin-request-content">
            {property.images && property.images[0] && (
              <img 
                src={property.images[0]} 
                alt={property.title} 
                className="admin-request-property-image"
              />
            )}
            <div className="admin-request-info-grid">
              <div className="admin-request-info-row">
                <strong>Property Title:</strong>
                <span>{property.title || 'N/A'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Price (ETB):</strong>
                <span>
                  {property.price ? `ETB ${Number(property.price).toLocaleString()}` : 'N/A'}
                </span>
              </div>
              <div className="admin-request-info-row">
                <strong>Location:</strong>
                <span>{property.location || 'N/A'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Address:</strong>
                <span>{property.address || 'N/A'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Bedrooms:</strong>
                <span>{property.bedrooms || 'N/A'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Rooms:</strong>
                <span>{property.rooms || 'N/A'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Availability:</strong>
                <span>{property.availabilityStatus || 'Available'}</span>
              </div>
              <div className="admin-request-info-row full-width">
                <strong>Description:</strong>
                <p className="admin-request-description">
                  {property.description || 'No description provided'}
                </p>
              </div>
              <div className="admin-request-info-row">
                <strong>Property ID:</strong>
                <span className="admin-request-id-text">{property._id || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== LANDLORD INFORMATION ===== */}
        <div className="admin-request-section">
          <h3 className="admin-request-section-title">👨‍💼 Landlord Information</h3>
          <div className="admin-request-content">
            <div className="admin-request-info-grid">
              <div className="admin-request-info-row">
                <strong>Name:</strong>
                <span>{landlord.name || 'Unknown'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Email:</strong>
                <span>{landlord.email || 'Not available'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Phone:</strong>
                <span>{landlord.phone || 'Not provided'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== TENANT INFORMATION ===== */}
        <div className="admin-request-section">
          <h3 className="admin-request-section-title">👤 Tenant Information</h3>
          <div className="admin-request-content">
            <div className="admin-request-info-grid">
              <div className="admin-request-info-row">
                <strong>Name:</strong>
                <span>{tenant.name || request.tenantName || 'Unknown'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Email:</strong>
                <span>{tenant.email || request.tenantEmail || 'Not available'}</span>
              </div>
              <div className="admin-request-info-row">
                <strong>Phone:</strong>
                <span>{tenant.phone || request.tenantPhone || 'Not provided'}</span>
              </div>
              {request.occupation && (
                <div className="admin-request-info-row">
                  <strong>Occupation:</strong>
                  <span>{request.occupation}</span>
                </div>
              )}
              {request.numberOfPeople && (
                <div className="admin-request-info-row">
                  <strong>Number of People:</strong>
                  <span>{request.numberOfPeople}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== RENTAL REQUEST DETAILS ===== */}
        <div className="admin-request-section">
          <h3 className="admin-request-section-title">📋 Rental Request Details</h3>
          <div className="admin-request-content">
            <div className="admin-request-info-grid">
              <div className="admin-request-info-row">
                <strong>Request Date:</strong>
                <span>
                  {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="admin-request-info-row">
                <strong>Move-in Date:</strong>
                <span>
                  {request.moveInDate ? new Date(request.moveInDate).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="admin-request-info-row full-width">
                <strong>Message:</strong>
                <p className="admin-request-description">
                  {request.message || 'No message provided'}
                </p>
              </div>
              {request.additionalNotes && (
                <div className="admin-request-info-row full-width">
                  <strong>Additional Notes:</strong>
                  <p className="admin-request-description">
                    {request.additionalNotes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== ADMIN ACTIONS ===== */}
        {request.status === 'pending' && (
          <div className="admin-request-actions">
            <button
              type="button"
              className="admin-btn admin-btn-approve admin-action-button"
              onClick={handleApprove}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'approve' ? '⏳ Approving...' : '✅ Approve Request'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-reject admin-action-button"
              onClick={handleReject}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'reject' ? '⏳ Rejecting...' : '❌ Reject Request'}
            </button>
          </div>
        )}

        {request.status !== 'pending' && (
          <div className="admin-request-actions">
            <p className="admin-request-no-action">
              This request has already been {request.status}. No further action is needed.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminRentalRequestDetail;
