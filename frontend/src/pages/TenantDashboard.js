import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './TenantDashboard.css';

const TenantDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadStats = async () => {
      setStatsError('');
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [propertiesRes, requestsRes, favoritesRes, notificationsRes] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_URL}/api/properties?verified=true&availability=available`, { headers }),
          axios.get(`${process.env.REACT_APP_API_URL}/api/rent-requests/my-requests`, { headers }),
          axios.get(`${process.env.REACT_APP_API_URL}/api/favorites`, { headers }),
          axios.get(`${process.env.REACT_APP_API_URL}/api/notifications/unread-count`, { headers }),
        ]);

        if (!isActive) return;
        setStats([
          { label: 'Available Properties', value: Array.isArray(propertiesRes.data) ? propertiesRes.data.length : 0 },
          { label: 'My Rental Requests', value: Array.isArray(requestsRes.data) ? requestsRes.data.length : 0 },
          { label: 'Favorite Properties', value: Array.isArray(favoritesRes.data) ? favoritesRes.data.length : 0 },
          { label: 'Unread Notifications', value: Number(notificationsRes.data?.unreadCount || 0) },
        ]);
      } catch (error) {
        if (!isActive) return;
        console.error('Unable to load tenant dashboard statistics:', error);
        setStatsError('Unable to load dashboard statistics. Please refresh the page to try again.');
      }
    };

    if (user?.role === 'tenant') loadStats();
    return () => {
      isActive = false;
    };
  }, [user]);

  return (
    <div className="tenant-container tenant-dashboard-home">
      <div className="tenant-header">
        <h1 className="tenant-title">Tenant Dashboard</h1>
        <p className="tenant-subtitle tenant-welcome">Welcome, {user?.name}!</p>
      </div>
      {statsError ? (
        <p className="tenant-dashboard-stats-error" role="alert">{statsError}</p>
      ) : stats ? (
        <section className="tenant-stats" aria-label="Dashboard statistics">
          {stats.map(({ label, value }) => (
            <article className="tenant-stat-card" key={label}>
              <span className="tenant-stat-number">{Number(value).toLocaleString()}</span>
              <span className="tenant-stat-label">{label}</span>
            </article>
          ))}
        </section>
      ) : (
        <p className="tenant-dashboard-stats-loading" role="status">Loading dashboard statistics...</p>
      )}
    </div>
  );
};

export default TenantDashboard;
