import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import BackToDashboard from '../components/BackToDashboard';
import { useLanguage } from '../context/LanguageContext';
import './adminDashboard.css';

const chartPalette = ['#7c3aed', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#14b8a6'];
const statusColors = {
  Verified: '#10b981',
  Approved: '#10b981',
  Pending: '#f59e0b',
  'Under Review': '#f59e0b',
  Rejected: '#ef4444',
  Available: '#2563eb',
  Rented: '#7c3aed',
  Confirmed: '#0f766e',
  Expired: '#64748b',
  'Area Admins': '#f97316',
  'Platform Admin': '#06b6d4',
  'Other Users': '#94a3b8',
  Other: '#94a3b8',
  'Other Properties': '#94a3b8',
  'Other Availability': '#94a3b8',
  'Other Requests': '#94a3b8',
};

const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatStatusLabel = (value) => {
  const status = String(value || '').trim();
  if (!status || status.toLowerCase() === 'unknown') return 'Other';
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

const statusChartItems = (breakdown, knownStatuses, colors, fallbackItems) => {
  if (!breakdown || typeof breakdown !== 'object') return fallbackItems;
  const entries = Object.entries(breakdown);
  const knownEntries = knownStatuses.map(([status, label]) => {
    const entry = entries.find(([key]) => key.toLowerCase() === status);
    return {
      label,
      value: entry ? entry[1] : 0,
      color: colors[label],
      key: status,
    };
  });
  const additionalEntries = entries
    .filter(([status]) => !knownStatuses.some(([known]) => known === status.toLowerCase()))
    .map(([status, value]) => {
      const label = formatStatusLabel(status);
      return { label, value, color: colors[label] || statusColors.Other, key: status };
    });
  return [...knownEntries, ...additionalEntries];
};

const monthLabel = (key) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
};

export const fillTrendMonths = (points = [], now = new Date(), maxMonths = 12) => {
  const countsByMonth = new Map();
  const currentIndex = now.getFullYear() * 12 + now.getMonth();
  points.forEach((point) => {
    const key = point.key || point.label;
    if (!/^\d{4}-\d{2}$/.test(key || '')) return;
    const [year, month] = key.split('-').map(Number);
    if (year * 12 + month - 1 > currentIndex) return;
    countsByMonth.set(key, (countsByMonth.get(key) || 0) + Number(point.value || 0));
  });
  if (countsByMonth.size === 0) return [];

  const earliestKey = [...countsByMonth.keys()].sort()[0];
  const [year, month] = earliestKey.split('-').map(Number);
  const firstIndex = Math.max(year * 12 + month - 1, currentIndex - maxMonths + 1);

  return Array.from({ length: currentIndex - firstIndex + 1 }, (_, offset) => {
    const index = firstIndex + offset;
    const monthYear = Math.floor(index / 12);
    const monthNumber = index % 12 + 1;
    const key = `${monthYear}-${String(monthNumber).padStart(2, '0')}`;
    return { key, label: monthLabel(key), value: countsByMonth.get(key) || 0 };
  });
};

const buildBarChart = (items, t) => {
  const max = items.reduce((largest, item) => Math.max(largest, Number(item.value || 0)), 0) || 1;

  return (
    <div className="admin-chart-bars">
      {items.map((item, index) => (
        <div key={item.key || `${item.label}-${index}`} className="admin-chart-bar-group">
          <div className="admin-chart-bar-value">{formatNumber(item.value)}</div>
          <div className="admin-chart-bar-track">
            <div
              className="admin-chart-bar-fill"
              style={{
                width: `${Math.max((Number(item.value || 0) / max) * 100, item.value ? 10 : 0)}%`,
                background: item.color || chartPalette[index % chartPalette.length],
              }}
            />
          </div>
          <div className="admin-chart-bar-label">{t(item.label)}</div>
        </div>
      ))}
    </div>
  );
};

const buildDonutChart = (items, t) => {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  let startAngle = 0;
  const segments = items.map((item, index) => {
    const start = startAngle;
    const end = start + (Number(item.value || 0) / total) * 360;
    startAngle = end;
    return {
      ...item,
      start,
      end,
      color: item.color || chartPalette[index % chartPalette.length],
    };
  });

  return (
    <div className="admin-donut-wrap">
      <svg viewBox="0 0 120 120" className="admin-donut-chart" role="img" aria-label={t('User Roles')}>
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
            <span>{t(segment.label)}</span>
            <strong>{formatNumber(segment.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminAnalytics = () => {
  const { t } = useLanguage();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('all');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const params = new URLSearchParams({ range, timezone });
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/admin/analytics?${params.toString()}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      setAnalytics(response.data);
    } catch (requestError) {
      console.error('Error fetching admin analytics:', requestError);
      setError(requestError.response?.data?.message || 'Unable to load admin analytics.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const statCards = useMemo(() => {
    if (!analytics?.totals) return [];
    const totals = analytics.totals;
    const rentalRequestTotal = Number(totals.totalRentalRequests || 0);
    const approvedRequestCount = Number(totals.approvedRentalRequests || 0);
    const approvalPercent = rentalRequestTotal
      ? (approvedRequestCount / rentalRequestTotal) * 100
      : 0;
    const approvalRate = `${approvalPercent.toFixed(1)}%`;
    return [
      { label: 'Total Users', value: totals.totalUsers },
      { label: 'Tenants', value: totals.totalTenants },
      { label: 'Landlords', value: totals.totalLandlords },
      { label: 'Area Admins', value: totals.totalAreaAdmins ?? analytics.userRoles?.areaAdmins ?? 0 },
      { label: 'Platform Admin', value: totals.totalPlatformAdmins ?? analytics.userRoles?.platformAdmins ?? totals.totalAdmins },
      { label: 'Total Properties', value: totals.totalProperties },
      { label: 'Verified', value: totals.verifiedProperties },
      { label: 'Under Review', value: totals.pendingProperties },
      { label: 'Rejected', value: totals.rejectedProperties },
      { label: 'Rental Requests', value: rentalRequestTotal },
      { label: 'Approved Requests', value: totals.approvedRentalRequests },
      { label: 'Under Review Requests', value: totals.pendingRentalRequests },
      { label: 'Rejected Requests', value: totals.rejectedRentalRequests },
      { label: 'Confirmed Requests', value: totals.confirmedRentalRequests },
      { label: 'Expired Requests', value: totals.expiredRentalRequests },
      { label: 'Other Requests', value: totals.otherRentalRequests },
      { label: 'Approval rate', value: approvalRate },
    ];
  }, [analytics]);

  const verificationChart = useMemo(() => {
    if (!analytics?.propertyStatus) return [];
    return statusChartItems(
      analytics.propertyStatus.breakdown,
      [['approved', 'Verified'], ['pending', 'Under Review'], ['rejected', 'Rejected']],
      statusColors,
      [
        { label: 'Verified', value: analytics.propertyStatus.verified, color: statusColors.Verified },
        { label: 'Under Review', value: analytics.propertyStatus.pending, color: statusColors.Pending },
        { label: 'Rejected', value: analytics.propertyStatus.rejected, color: statusColors.Rejected },
        { label: 'Other', value: analytics.propertyStatus.other || 0, color: statusColors.Other },
      ],
    );
  }, [analytics]);

  const availabilityChart = useMemo(() => {
    if (!analytics?.propertyStatus) return [];
    return statusChartItems(
      analytics.propertyStatus.availabilityBreakdown,
      [['available', 'Available'], ['rented', 'Rented']],
      statusColors,
      [
        { label: 'Available', value: analytics.propertyStatus.available, color: statusColors.Available },
        { label: 'Rented', value: analytics.propertyStatus.rented, color: statusColors.Rented },
        { label: 'Other', value: analytics.propertyStatus.otherAvailability || 0, color: statusColors.Other },
      ],
    );
  }, [analytics]);

  const userChart = useMemo(() => {
    if (!analytics?.userRoles) return [];
    const roles = analytics.userRoles;
    const areaAdmins = Number(roles.areaAdmins ?? analytics.totals?.totalAreaAdmins ?? 0);
    const platformAdmins = Number(roles.platformAdmins ?? analytics.totals?.totalPlatformAdmins ?? roles.admins ?? 0);
    const otherUsers = Math.max(
      Number(roles.total ?? analytics.totals?.totalUsers ?? 0)
        - Number(roles.tenants || 0)
        - Number(roles.landlords || 0)
        - areaAdmins
        - platformAdmins,
      0,
    );
    return [
      { label: 'Tenants', value: roles.tenants, color: '#7c3aed' },
      { label: 'Landlords', value: roles.landlords, color: '#2563eb' },
      { label: 'Area Admins', value: areaAdmins, color: '#f97316' },
      { label: 'Platform Admin', value: platformAdmins, color: '#06b6d4' },
      ...(otherUsers ? [{ label: 'Other Users', value: otherUsers, color: statusColors['Other Users'] }] : []),
    ];
  }, [analytics]);

  const rentalChart = useMemo(() => {
    if (!analytics?.rentalRequestStatus) return [];
    return [
      { label: 'Under Review', value: analytics.rentalRequestStatus.pending, color: statusColors.Pending },
      { label: 'Approved', value: analytics.rentalRequestStatus.approved, color: statusColors.Approved },
      { label: 'Rejected', value: analytics.rentalRequestStatus.rejected, color: statusColors.Rejected },
      { label: 'Confirmed', value: analytics.rentalRequestStatus.confirmed || 0, color: statusColors.Confirmed },
      { label: 'Expired', value: analytics.rentalRequestStatus.expired || 0, color: statusColors.Expired },
      { label: 'Other Requests', value: analytics.rentalRequestStatus.other || 0, color: statusColors.Other },
    ];
  }, [analytics]);

  const trendSeries = useMemo(() => {
    if (!analytics?.trends) return [];
    return [
      { label: 'Properties', points: fillTrendMonths(analytics.trends.propertiesByMonth || []) },
      { label: 'Users', points: fillTrendMonths(analytics.trends.usersByMonth || []) },
      { label: 'Rental Requests', points: fillTrendMonths(analytics.trends.rentalRequestsByMonth || []) },
    ];
  }, [analytics]);

  if (loading) {
    return (
      <div className="admin-container admin-analytics-page">
        <BackToDashboard dashboardRoute="/admin-dashboard" />
        <div className="admin-empty-text">{t('Loading analytics...')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-container admin-analytics-page">
        <BackToDashboard dashboardRoute="/admin-dashboard" />
        <div className="admin-empty-text">{t(error)}</div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="admin-container admin-analytics-page">
        <BackToDashboard dashboardRoute="/admin-dashboard" />
        <div className="admin-empty-text">{t('No analytics data available.')}</div>
      </div>
    );
  }

  return (
    <div className="admin-container admin-analytics-page">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-icon" aria-hidden="true" />
              <span className="admin-title-gradient">{t('Admin Analytics')}</span>
            </h1>
            <p className="admin-subtitle">{t('Platform insights from the live database')}</p>
          </div>
          <label className="admin-analytics-range">
            <span>{t('Date range')}</span>
            <select value={range} onChange={(event) => setRange(event.target.value)}>
              <option value="30d">{t('Last 30 days')}</option>
              <option value="6m">{t('Last 6 months')}</option>
              <option value="all">{t('All time')}</option>
            </select>
          </label>
        </div>
      </div>

      <section className="admin-analytics-stats">
        {statCards.map((stat) => (
          <div key={stat.label} className="admin-analytics-stat-card">
            <div className="admin-analytics-stat-label">{t(stat.label)}</div>
            <div className="admin-analytics-stat-value">
              {stat.label === 'Approval rate' ? stat.value : formatNumber(stat.value)}
            </div>
          </div>
        ))}
      </section>

      <section className="admin-analytics-grid">
        <div className="admin-chart-panel">
          <h3>{t('Verification status')}</h3>
          {verificationChart.some((item) => Number(item.value) > 0)
            ? buildBarChart(verificationChart, t)
            : <div className="admin-empty-text">{t('No property status data available.')}</div>}
        </div>

        <div className="admin-chart-panel">
          <h3>{t('Availability')}</h3>
          {availabilityChart.some((item) => Number(item.value) > 0)
            ? buildBarChart(availabilityChart, t)
            : <div className="admin-empty-text">{t('No property availability data available.')}</div>}
        </div>

        <div className="admin-chart-panel">
          <h3>{t('User Roles')}</h3>
          {userChart.some((item) => Number(item.value) > 0)
            ? buildDonutChart(userChart, t)
            : <div className="admin-empty-text">{t('No user role data available.')}</div>}
        </div>

        <div className="admin-chart-panel">
          <h3>{t('Rental Requests')}</h3>
          {rentalChart.some((item) => Number(item.value) > 0)
            ? buildBarChart(rentalChart, t)
            : <div className="admin-empty-text">{t('No rental request data available.')}</div>}
        </div>
      </section>

      <section className="admin-chart-panel admin-trend-panel">
        <div className="admin-analytics-trend-heading">
          <h3>{t('Growth Over Time')}</h3>
          <span>{t(range === 'all' ? 'All time' : range === '6m' ? 'Last 6 months' : 'Last 30 days')}</span>
        </div>
        {trendSeries.some((series) => series.points.length > 0) ? (
          <div className="admin-trend-grid">
            {trendSeries.map((series) => (
              <div key={series.label} className="admin-trend-series">
                <h4>{t(series.label)}</h4>
                {series.points.length > 0
                  ? buildBarChart(series.points, t)
                  : <div className="admin-empty-text">{t('No data')}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty-text">{t('No historical data available yet.')}</div>
        )}
      </section>
    </div>
  );
};

export default AdminAnalytics;
