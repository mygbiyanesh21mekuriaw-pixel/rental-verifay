import React, { useEffect, useState } from 'react';
import axios from 'axios';

const LandlordProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://localhost:5000/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProfile(response.data.user || response.data);
      } catch (error) {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  return (
    <div className="tenant-container tenant-section-page">
      <div className="tenant-header">
        <h1 className="tenant-title">👤 Profile</h1>
      </div>

      {loading ? (
        <div className="tenant-loading">Loading profile...</div>
      ) : !profile ? (
        <div className="tenant-empty">
          <p>Profile not available.</p>
        </div>
      ) : (
        <div className="tenant-request-detail-card">
          <div className="tenant-request-detail-row">
            <strong>Name:</strong>
            <span>{profile.name || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Email:</strong>
            <span>{profile.email || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Phone:</strong>
            <span>{profile.phone || 'N/A'}</span>
          </div>
          <div className="tenant-request-detail-row">
            <strong>Role:</strong>
            <span>{profile.role || 'landlord'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandlordProfile;
