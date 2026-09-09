import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import BackToDashboard from '../components/BackToDashboard';
import './TenantDashboard.css';

const statusLabel = (status) => {
  if (status === 'approved' || status === 'confirmed') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'pending') return 'Pending';
  if (status === 'expired') return 'Expired';
  return status || 'N/A';
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

const TenantRentalRequestDetail = () => {
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRequest = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`http://localhost:5000/api/rent-requests/my-requests/${requestId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRequest(response.data);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load rental request.');
      } finally {
        setLoading(false);
      }
    };

    if (requestId) {
      loadRequest();
    }
  }, [requestId]);

  if (loading) {
    return <div className="tenant-loading">Loading rental request details...</div>;
  }

  if (error) {
    return (
      <div className="tenant-container tenant-section-page">
        <div className="tenant-header">
          <h1 className="tenant-title">Rental Request Details</h1>
          <BackToDashboard />
        </div>
        <div className="tenant-empty">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="tenant-container tenant-section-page">
        <div className="tenant-header">
          <h1 className="tenant-title">Rental Request Details</h1>
          <BackToDashboard />
        </div>
        <div className="tenant-empty">
          <p>Rental request not found.</p>
        </div>
      </div>
    );
  }

  const property = request.property || {};
  const landlord = request.landlord || {};

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">Rental Request Details</h1>
        <Link to="/tenant/rental-requests" className="tenant-back-btn">← Back to Rental Requests</Link>
      </div>

      <div className="tenant-request-detail-card">
        <div className="tenant-request-detail-row">
          <strong>Property:</strong>
          <span>{property.title || 'N/A'}</span>
        </div>
        <div className="tenant-request-detail-row">
          <strong>Location:</strong>
          <span>{property.location || 'N/A'}</span>
        </div>
        <div className="tenant-request-detail-row">
          <strong>Rent:</strong>
          <span>{property.price ? `ETB ${Number(property.price).toLocaleString()}` : 'N/A'}</span>
        </div>
        <div className="tenant-request-detail-row">
          <strong>Request Status:</strong>
          <span>{statusLabel(request.status)}</span>
        </div>
        <div className="tenant-request-detail-row">
          <strong>Landlord:</strong>
          <span>{landlord.name || 'N/A'}</span>
        </div>
        <div className="tenant-request-detail-row">
          <strong>Requested Date:</strong>
          <span>{formatDate(request.createdAt)}</span>
        </div>

        <div className="tenant-request-detail-section">
          <h3>Admin Response:</h3>
          <p>{request.adminComment || request.landlordComment || 'No admin response provided.'}</p>
        </div>

        <div className="tenant-request-detail-row">
          <strong>Admin Decision Date:</strong>
          <span>{formatDate(request.reviewedAt || request.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
};

export default TenantRentalRequestDetail;
