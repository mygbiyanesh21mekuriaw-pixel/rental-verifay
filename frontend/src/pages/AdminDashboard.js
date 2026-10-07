import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FaBuilding, FaCheck, FaHourglassHalf, FaTimes } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import './adminDashboard.css';

const AdminDashboard = () => {
  const { user } = useAuth();
  const adminLabel = user?.adminType === 'area' ? 'Area Admin' : 'Platform Admin';
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadStats = async () => {
      setStatsError('');
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/admin/properties?status=all`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!isActive) return;
        const properties = Array.isArray(response.data) ? response.data : [];
        setStats([
          { label: 'Total Properties', value: properties.length, icon: <FaBuilding aria-hidden="true" />, iconClass: 'admin-stat-icon-total' },
          { label: 'Verified Properties', value: properties.filter((property) => property.isVerified && property.verificationStatus === 'approved').length, icon: <FaCheck aria-hidden="true" />, iconClass: 'admin-stat-icon-verified' },
          { label: 'Under Review', value: properties.filter((property) => property.verificationStatus === 'pending').length, icon: <FaHourglassHalf aria-hidden="true" />, iconClass: 'admin-stat-icon-review' },
          { label: 'Rejected Properties', value: properties.filter((property) => property.verificationStatus === 'rejected').length, icon: <FaTimes aria-hidden="true" />, iconClass: 'admin-stat-icon-rejected' },
        ]);
      } catch (error) {
        if (!isActive) return;
        console.error('Unable to load admin dashboard statistics:', error);
        setStatsError('Unable to load dashboard statistics. Please refresh the page to try again.');
      }
    };

    if (user?.role === 'admin') loadStats();
    return () => {
      isActive = false;
    };
  }, [user]);

  return (
    <div className="admin-container admin-dashboard-home">
      <div className="admin-header admin-dashboard-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-icon"></span>
              <span className="admin-title-gradient">Admin Dashboard</span>
            </h1>
            <p className="admin-subtitle admin-dashboard-welcome">Welcome to the Admin Dashboard, <strong>{user?.name}</strong> ({adminLabel})!</p>
          </div>
        </div>
      </div>

      {statsError ? (
        <div className="admin-overview-panel admin-dashboard-stats-message" role="alert">{statsError}</div>
      ) : stats ? (
        <section className="admin-dashboard-stats" aria-label="Dashboard statistics">
          {stats.map(({ label, value, icon, iconClass }) => (
            <article className="admin-analytics-stat-card" key={label}>
              <div className="admin-dashboard-stat-heading">
                <div className="admin-analytics-stat-label">{label}</div>
                <span className={`admin-dashboard-stat-icon ${iconClass}`}>{icon}</span>
              </div>
              <div className="admin-analytics-stat-value">{Number(value).toLocaleString()}</div>
            </article>
          ))}
        </section>
      ) : (
        <div className="admin-overview-panel admin-dashboard-stats-message" role="status">Loading dashboard statistics...</div>
      )}
    </div>
  );
};

export default AdminDashboard;