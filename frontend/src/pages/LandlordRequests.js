import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const formatStatus = (status) => {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const LandlordRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rent-requests/landlord-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRequests(response.data || []);
      } catch (error) {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, []);

  return (
    <div className="landlord-requests-page tenant-container tenant-section-page !m-0 !w-full !max-w-none !p-0 flex flex-col gap-3">
      <h1 className="m-0 text-2xl font-bold text-slate-800">Rental Requests</h1>

      {loading ? (
        <div className="tenant-loading">Loading rental requests...</div>
      ) : requests.length === 0 ? (
        <div className="tenant-empty">
          <p>You have no rental requests yet.</p>
        </div>
      ) : (
        <section className="tenant-section">
          {requests.map((request) => (
            <div key={request._id} className="tenant-request-card">
              <div className="tenant-request-header">
                <div>
                  <h3>{request.property?.title || 'Property'}</h3>
                  <p className="tenant-request-detail"> {request.property?.location || 'Location unavailable'}</p>
                </div>
                <span className={`tenant-request-status tenant-request-status-${request.status}`}>
                  {formatStatus(request.status)}
                </span>
              </div>

              <p className="tenant-request-detail">Tenant: {request.tenant?.name || 'Unknown tenant'}</p>
              <p className="tenant-request-detail"> {request.tenant?.email || 'No email available'}</p>
              <p className="tenant-request-detail">Requested: {request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'N/A'}</p>
              <p className="tenant-request-detail">Message: {request.message || 'No message provided'}</p>

              {request.status === 'pending' && (
                <div className="tenant-request-actions">
                  <Link to={`/landlord/rental-requests/${request._id}`} className="tenant-request-btn tenant-request-btn-primary rounded-lg bg-[var(--rv-dashboard-topbar)] px-4 py-2 font-semibold text-white no-underline transition-colors hover:bg-[var(--rv-dashboard-navy)]">View Details
                  </Link>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default LandlordRequests;
