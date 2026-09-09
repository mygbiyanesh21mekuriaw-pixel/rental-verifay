import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './adminDashboard.css';

const chartPalette = ['#7c3aed', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#14b8a6'];

const formatNumber = (value) => Number(value || 0).toLocaleString();

const buildBarChart = (items, keyLabel = 'label', keyValue = 'value') => {
  const max = items.reduce((largest, item) => Math.max(largest, Number(item[keyValue] || 0)), 0) || 1;

  return (
    <div className="admin-chart-bars">
      {items.map((item, index) => (
        <div key={`${item[keyLabel]}-${index}`} className="admin-chart-bar-group">
          <div className="admin-chart-bar-value">{formatNumber(item[keyValue])}</div>
          <div className="admin-chart-bar-track">
            <div
              className="admin-chart-bar-fill"
              style={{
                width: `${Math.max((Number(item[keyValue] || 0) / max) * 100, item[keyValue] ? 10 : 0)}%`,
                background: chartPalette[index % chartPalette.length],
              }}
            />
          </div>
          <div className="admin-chart-bar-label">{item[keyLabel]}</div>
        </div>
      ))}
    </div>
  );
};

const buildDonutChart = (items) => {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;

  let startAngle = 0;
  const segments = items.map((item, index) => {
    const fraction = Number(item.value || 0) / total;
    const start = startAngle;
    const end = startAngle + fraction * 360;
    startAngle = end;

    return {
      ...item,
      start,
      end,
      color: chartPalette[index % chartPalette.length],
    };
  });

  return (
    <div className="admin-donut-wrap">
      <svg viewBox="0 0 120 120" className="admin-donut-chart" role="img" aria-label="Chart">
        {segments.map((segment, index) => {
          const radius = 42;
          const cx = 60;
          const cy = 60;
          const startRad = ((segment.start - 90) * Math.PI) / 180;
          const endRad = ((segment.end - 90) * Math.PI) / 180;
          const x1 = cx + radius * Math.cos(startRad);
          const y1 = cy + radius * Math.sin(startRad);
          const x2 = cx + radius * Math.cos(endRad);
          const y2 = cy + radius * Math.sin(endRad);
          const largeArcFlag = segment.end - segment.start > 180 ? 1 : 0;

          return (
            <path
              key={`${segment.label}-${index}`}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
              fill={segment.color}
            />
          );
        })}
        <circle cx="60" cy="60" r="22" fill="#ffffff" />
      </svg>
      <div className="admin-donut-legend">
        {segments.map((segment, index) => (
          <div key={`${segment.label}-legend-${index}`} className="admin-donut-legend-item">
            <span className="admin-donut-dot" style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <strong>{formatNumber(segment.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      setError('');

      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://localhost:5000/api/admin/analytics', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAnalytics(response.data);
      } catch (requestError) {
        console.error('Error fetching admin analytics:', requestError);
        setError(requestError.response?.data?.message || 'Unable to load admin analytics.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const statCards = useMemo(() => {
    if (!analytics?.totals) return [];

    return [
      { label: 'Total Users', value: analytics.totals.totalUsers },
      { label: 'Tenants', value: analytics.totals.totalTenants },
      { label: 'Landlords', value: analytics.totals.totalLandlords },
      { label: 'Admins', value: analytics.totals.totalAdmins },
      { label: 'Total Properties', value: analytics.totals.totalProperties },
      { label: 'Verified', value: analytics.totals.verifiedProperties },
      { label: 'Pending', value: analytics.totals.pendingProperties },
      { label: 'Rejected', value: analytics.totals.rejectedProperties },
      { label: 'Rental Requests', value: analytics.totals.totalRentalRequests },
      { label: 'Approved Requests', value: analytics.totals.approvedRentalRequests },
      { label: 'Pending Requests', value: analytics.totals.pendingRentalRequests },
      { label: 'Rejected Requests', value: analytics.totals.rejectedRentalRequests },
    ];
  }, [analytics]);

  const propertyChart = useMemo(() => {
    if (!analytics?.propertyStatus) return [];
    return [
      { label: 'Verified', value: analytics.propertyStatus.verified },
      { label: 'Pending', value: analytics.propertyStatus.pending },
      { label: 'Rejected', value: analytics.propertyStatus.rejected },
      { label: 'Available', value: analytics.propertyStatus.available },
      { label: 'Rented', value: analytics.propertyStatus.rented },
    ];
  }, [analytics]);

  const userChart = useMemo(() => {
    if (!analytics?.userRoles) return [];
    return [
      { label: 'Tenants', value: analytics.userRoles.tenants },
      { label: 'Landlords', value: analytics.userRoles.landlords },
      { label: 'Admins', value: analytics.userRoles.admins },
    ];
  }, [analytics]);

  const rentalChart = useMemo(() => {
    if (!analytics?.rentalRequestStatus) return [];
    return [
      { label: 'Pending', value: analytics.rentalRequestStatus.pending },
      { label: 'Approved', value: analytics.rentalRequestStatus.approved },
      { label: 'Rejected', value: analytics.rentalRequestStatus.rejected },
    ];
  }, [analytics]);

  const trendSeries = useMemo(() => {
    if (!analytics?.trends) return [];
    return [
      { label: 'Properties', points: analytics.trends.propertiesByMonth || [] },
      { label: 'Users', points: analytics.trends.usersByMonth || [] },
      { label: 'Rental Requests', points: analytics.trends.rentalRequestsByMonth || [] },
    ];
  }, [analytics]);

  if (loading) {
    return <div className="admin-container"><div className="admin-empty-text">⏳ Loading analytics...</div></div>;
  }

  if (error) {
    return <div className="admin-container"><div className="admin-empty-text">⚠️ {error}</div></div>;
  }

  if (!analytics) {
    return <div className="admin-container"><div className="admin-empty-text">No analytics data available.</div></div>;
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title"><span className="admin-title-icon">📊</span><span className="admin-title-gradient">Admin Analytics</span></h1>
            <p className="admin-subtitle">Platform insights from the live database</p>
          </div>
          <button type="button" className="admin-logout-btn" onClick={() => window.location.href = '/admin-dashboard'}>
            <span className="admin-logout-icon">←</span>
            Back to dashboard
          </button>
        </div>
      </div>

      <section className="admin-analytics-stats">
        {statCards.map((stat) => (
          <div key={stat.label} className="admin-analytics-stat-card">
            <div className="admin-analytics-stat-label">{stat.label}</div>
            <div className="admin-analytics-stat-value">{formatNumber(stat.value)}</div>
          </div>
        ))}
      </section>

      <section className="admin-analytics-grid">
        <div className="admin-chart-panel">
          <h3>Property Status</h3>
          {propertyChart.some(item => Number(item.value) > 0) ? buildBarChart(propertyChart) : <div className="admin-empty-text">No property status data available.</div>}
        </div>

        <div className="admin-chart-panel">
          <h3>User Roles</h3>
          {userChart.some(item => Number(item.value) > 0) ? buildDonutChart(userChart) : <div className="admin-empty-text">No user role data available.</div>}
        </div>

        <div className="admin-chart-panel">
          <h3>Rental Requests</h3>
          {rentalChart.some(item => Number(item.value) > 0) ? buildBarChart(rentalChart) : <div className="admin-empty-text">No rental request data available.</div>}
        </div>
      </section>

      <section className="admin-chart-panel admin-trend-panel">
        <h3>Growth Over Time</h3>
        {trendSeries.some((series) => series.points.length > 0) ? (
          <div className="admin-trend-grid">
            {trendSeries.map((series) => (
              <div key={series.label} className="admin-trend-series">
                <h4>{series.label}</h4>
                {series.points.length > 0 ? buildBarChart(series.points.map((point) => ({ label: point.label, value: point.value }))) : <div className="admin-empty-text">No data</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty-text">No historical data available yet.</div>
        )}
      </section>
    </div>
  );
};

export default AdminAnalytics;
