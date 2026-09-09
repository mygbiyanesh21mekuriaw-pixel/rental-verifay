import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';

const formatStatus = (status) => {
  if (!status) return 'N/A';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const LandlordRequestDetail = () => {
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRequest = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`http://localhost:5000/api/rent-requests/landlord-requests/${requestId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRequest(response.data);
      } catch (error) {
        setRequest(null);
      } finally {
        setLoading(false);
      }
    };

    if (requestId) {
      loadRequest();
    }
  }, [requestId]);

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">Rental Request Details</h1>
        <Link to="/landlord/rental-requests" className="tenant-back-btn">← Back to Requests</Link>
      </div>

      {loading ? (
        <div className="tenant-loading">Loading request details...</div>
      ) : !request ? (
        <div className="tenant-empty">
          <p>Request not found.</p>
        </div>
      ) : (
        <div className="tenant-request-detail-card">
          <div className="tenant-request-detail-row">
            <strong>Property:</strong>
            <span>{request.property?.title || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Location:</strong>
            <span>{request.property?.location || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Status:</strong>
            <span>{formatStatus(request.status)}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Tenant:</strong>
            <span>{request.tenant?.name || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Phone:</strong>
            <span>{request.tenant?.phone || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Email:</strong>
            <span>{request.tenant?.email || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Requested Date:</strong>
            <span>{request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'N/A'}</span>
          </div>

          <div className="tenant-request-detail-section">
            <h3>Tenant Message:</h3>
            <p>{request.message || 'No message provided.'}</p>
          </div>

          {request.landlordComment && (
            <div className="tenant-request-detail-section">
              <h3>Landlord Comment:</h3>
              <p>{request.landlordComment}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LandlordRequestDetail;
