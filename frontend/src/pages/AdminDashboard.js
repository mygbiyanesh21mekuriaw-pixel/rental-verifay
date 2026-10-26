import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  FaBuilding,
  FaCheck,
  FaClipboardList,
  FaEnvelope,
  FaFileAlt,
  FaHourglassHalf,
  FaMoneyBill,
  FaTimes,
  FaUsers,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './adminDashboard.css';

const API_URL = process.env.REACT_APP_API_URL;
const STATUS_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'];

const getMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const buildMonthlyPropertySeries = (properties, now = new Date()) => {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const datedProperties = (properties || [])
    .map((property) => ({ property, date: new Date(property.createdAt) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()) && date <= now)
    .map(({ property, date }) => ({ property, key: getMonthKey(date) }));

  if (datedProperties.length === 0) return [];

  const earliestMonth = datedProperties.reduce(
    (earliest, { key }) => (key < earliest ? key : earliest),
    getMonthKey(currentMonth),
  );
  const [earliestYear, earliestMonthNumber] = earliestMonth.split('-').map(Number);
  const currentMonthIndex = currentMonth.getFullYear() * 12 + currentMonth.getMonth();
  const firstMonthIndex = Math.max(
    earliestYear * 12 + earliestMonthNumber - 1,
    currentMonthIndex - 5,
  );
  const firstMonth = new Date(Math.floor(firstMonthIndex / 12), firstMonthIndex % 12, 1);
  const monthCount = currentMonthIndex - firstMonthIndex + 1;
  const countsByMonth = new Map();

  datedProperties.forEach(({ key }) => {
    countsByMonth.set(key, (countsByMonth.get(key) || 0) + 1);
  });

  return Array.from({ length: monthCount }, (_, index) => {
    const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
    const key = getMonthKey(month);
    return {
      key,
      label: month.toLocaleString('en-US', { month: 'short' }),
      value: countsByMonth.get(key) || 0,
    };
  });
};

const getAssignedAreaName = (adminAreas) => {
  if (!Array.isArray(adminAreas) || adminAreas.length === 0) return '';
  return adminAreas
    .map((area) => {
      if (typeof area === 'string') return area.trim();
      return ['region', 'zone', 'wereda', 'city', 'subCity']
        .map((field) => String(area?.[field] || '').trim())
        .filter(Boolean)
        .join(', ');
    })
    .filter(Boolean)
    .join(' · ');
};

const isRoutineActivity = (log) => ['USER_LOGIN', 'USER_LOGOUT'].includes(
  String(log.action || '').toUpperCase(),
);

const DashboardSkeleton = ({ className = '' }) => (
  <div className={`admin-dashboard-skeleton ${className}`} aria-hidden="true">
    <span />
    <span />
    <span />
  </div>
);

const AdminDashboard = () => {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const today = new Date();
  const todayDateTime = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);
  const isPlatformAdmin = !user?.adminType || user.adminType === 'platform';
  const [properties, setProperties] = useState(null);
  const [platformData, setPlatformData] = useState(null);
  const [areaRentalRequests, setAreaRentalRequests] = useState(null);
  const [areaRentalRequestsError, setAreaRentalRequestsError] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const get = (path) => axios.get(`${API_URL}${path}`, { headers });

    const loadDashboard = async () => {
      setLoading(true);
      setStatsError('');
      setErrors({});

      try {
        const propertiesResponse = await get('/api/admin/properties?status=all');
        if (!active) return;
        const propertyRecords = Array.isArray(propertiesResponse.data)
          ? propertiesResponse.data
          : propertiesResponse.data?.properties;
        setProperties(Array.isArray(propertyRecords) ? propertyRecords : []);

        if (isPlatformAdmin) {
          setAreaRentalRequests(null);
          setAreaRentalRequestsError('');
          const requests = await Promise.allSettled([
            get('/api/admin/stats'),
            get('/api/admin/payment-periods'),
            get('/api/admin/system-logs?limit=100'),
          ]);
          if (!active) return;

          const keys = ['stats', 'payments', 'logs'];
          const data = {};
          const nextErrors = {};
          requests.forEach((result, index) => {
            const key = keys[index];
            if (result.status === 'fulfilled') {
              data[key] = result.value.data;
            } else {
              console.error(`Unable to load admin dashboard ${key}:`, result.reason);
              nextErrors[key] = t('Unable to load this data.');
            }
          });
          setPlatformData(data);
          setErrors(nextErrors);
        } else if (user?.adminType === 'area') {
          setPlatformData(null);
          setAreaRentalRequestsError('');
          try {
            const rentalRequestsResponse = await get('/api/rental-requests/admin-requests');
            if (!active) return;
            setAreaRentalRequests(Array.isArray(rentalRequestsResponse.data) ? rentalRequestsResponse.data : []);
          } catch (error) {
            if (!active) return;
            console.error('Unable to load area rental requests:', error);
            setAreaRentalRequests([]);
            setAreaRentalRequestsError(t('Unable to load rental requests.'));
          }
        } else {
          setPlatformData(null);
          setAreaRentalRequests(null);
          setAreaRentalRequestsError('');
        }
      } catch (error) {
        if (!active) return;
        console.error('Unable to load admin dashboard properties:', error);
        setStatsError(t('Unable to load dashboard statistics. Please refresh the page to try again.'));
      } finally {
        if (active) setLoading(false);
      }
    };

    if (user?.role === 'admin') loadDashboard();
    return () => {
      active = false;
    };
  }, [isPlatformAdmin, t, user]);

  const propertyStats = useMemo(() => {
    const records = properties || [];
    return {
      total: records.length,
      verified: records.filter((property) => property.isVerified && property.verificationStatus === 'approved').length,
      pending: records.filter((property) => property.verificationStatus === 'pending').length,
      rejected: records.filter((property) => property.verificationStatus === 'rejected').length,
      other: Math.max(
        records.length - records.filter((property) => property.isVerified && property.verificationStatus === 'approved').length
          - records.filter((property) => property.verificationStatus === 'pending').length
          - records.filter((property) => property.verificationStatus === 'rejected').length,
        0,
      ),
    };
  }, [properties]);

  const statCards = useMemo(() => {
    const cards = [
      { label: 'Total Properties', value: propertyStats.total, icon: <FaBuilding aria-hidden="true" />, iconClass: 'total', to: '/admin-dashboard/all-properties' },
      { label: 'Verified Properties', value: propertyStats.verified, icon: <FaCheck aria-hidden="true" />, iconClass: 'verified', to: '/admin-dashboard/verified' },
      { label: 'Under Review', value: propertyStats.pending, icon: <FaHourglassHalf aria-hidden="true" />, iconClass: 'review', to: isPlatformAdmin ? '/admin-dashboard/review-properties' : '/admin-dashboard/pending' },
      { label: 'Rejected Properties', value: propertyStats.rejected, icon: <FaTimes aria-hidden="true" />, iconClass: 'rejected', to: '/admin-dashboard/rejected' },
    ];

    if (isPlatformAdmin && platformData?.stats) {
      cards.push({
        label: 'Total Users',
        value: platformData.stats.totalUsers,
        icon: <FaUsers aria-hidden="true" />,
        iconClass: 'users',
        to: '/admin-dashboard/all-users',
      });
      cards.push({
        label: 'Area Admins',
        value: platformData.stats.areaAdmins,
        icon: <FaUsers aria-hidden="true" />,
        iconClass: 'users',
        to: '/admin-dashboard/all-users',
      });
      cards.push({
        label: 'Platform Admin',
        value: platformData.stats.platformAdmins,
        icon: <FaUsers aria-hidden="true" />,
        iconClass: 'users',
        to: '/admin-dashboard/all-users',
      });
    }
    if (isPlatformAdmin && Array.isArray(platformData?.payments)) {
      cards.push({
        label: 'Pending Payments',
        value: platformData.payments.filter((payment) => payment.status === 'pending').length,
        icon: <FaMoneyBill aria-hidden="true" />,
        iconClass: 'payments',
        to: '/admin-dashboard/payment-period',
      });
    }
    return cards;
  }, [isPlatformAdmin, platformData, propertyStats]);

  const monthlyProperties = useMemo(() => {
    return buildMonthlyPropertySeries(properties);
  }, [properties]);

  const donutSegments = [
    { label: t('Verified'), value: propertyStats.verified, color: STATUS_COLORS[0] },
    { label: t('Under Review'), value: propertyStats.pending, color: STATUS_COLORS[1] },
    { label: t('Rejected'), value: propertyStats.rejected, color: STATUS_COLORS[2] },
    { label: t('Other'), value: propertyStats.other, color: STATUS_COLORS[3] },
  ];
  const chartTotal = donutSegments.reduce((total, segment) => total + segment.value, 0);
  let chartOffset = 0;
  const donutGradient = donutSegments.map((segment) => {
    const start = chartOffset;
    chartOffset += chartTotal ? (segment.value / chartTotal) * 100 : 0;
    return `${segment.color} ${start}% ${chartOffset}%`;
  }).join(', ');
  const maxMonthlyProperties = Math.max(...monthlyProperties.map((month) => month.value), 1);
  const pendingProperties = (properties || [])
    .filter((property) => property.verificationStatus === 'pending')
    .slice(0, 5);
  const rentalRequestCounts = (areaRentalRequests || []).reduce((counts, request) => {
    const status = String(request.status || '').toLowerCase();
    if (status === 'pending' || status === 'approved' || status === 'rejected') {
      counts[status] += 1;
    }
    return counts;
  }, { pending: 0, approved: 0, rejected: 0 });
  const assignedAreaName = getAssignedAreaName(user?.adminAreas);
  const allRecentLogs = platformData?.logs?.logs || [];
  const meaningfulLogs = allRecentLogs.filter((log) => !isRoutineActivity(log));
  const recentLogs = [
    ...meaningfulLogs.slice(0, 5),
    ...allRecentLogs.filter(isRoutineActivity).slice(0, Math.max(5 - meaningfulLogs.length, 0)),
  ];
  const canOpenPlatformSections = isPlatformAdmin;

  const renderSkeletonCards = (count, className = '') => (
    Array.from({ length: count }, (_, index) => (
      <DashboardSkeleton className={className} key={index} />
    ))
  );

  return (
    <div className={`admin-container admin-dashboard-home !m-0 !w-full !max-w-none !min-h-0 !overflow-visible !bg-transparent !p-0 !pb-0${user?.adminType === 'area' ? ' admin-dashboard-area' : ''}`}>
      <header className="admin-header dashboard-welcome-banner flex w-full flex-col gap-2 bg-green-700 p-4 text-white sm:flex-row sm:items-start sm:justify-between md:p-6">
        <div className="min-w-0">
          <h1 className="admin-dashboard-welcome-title !text-white">
            {t('Welcome back, ')}{user?.name || t('Platform Administrator')}
          </h1>
          <p className="admin-dashboard-subtitle !text-white/85">
            {isPlatformAdmin
              ? t('Here is what is happening on the platform today.')
              : t('Area: {area} - Here is what is happening in your area today.').replace('{area}', assignedAreaName || t('your assigned area'))}
          </p>
        </div>
        <time className="shrink-0 text-right text-xs font-medium leading-snug text-white/90 sm:pt-1" dateTime={todayDateTime}>
          {formatDate(today, { dateStyle: 'full' })}
        </time>
      </header>

      {statsError ? (
        <div className="admin-overview-panel admin-dashboard-stats-message" role="alert">{statsError}</div>
      ) : (
        <section className="admin-dashboard-stats" aria-label={t('Dashboard statistics')}>
          {loading ? renderSkeletonCards(isPlatformAdmin ? 9 : 4, 'admin-stat-skeleton') : statCards.map(({ label, value, icon, iconClass, to }) => (
            <Link className="admin-analytics-stat-card admin-dashboard-stat-link" key={label} to={to}>
              <div className="admin-dashboard-stat-heading">
                <div className="admin-analytics-stat-label">{t(label)}</div>
                <span className={`admin-dashboard-stat-icon admin-stat-icon-${iconClass}`}>{icon}</span>
              </div>
              <div className="admin-analytics-stat-value">{Number(value || 0).toLocaleString()}</div>
            </Link>
          ))}
        </section>
      )}

      <section className="admin-dashboard-charts" aria-label={t('Dashboard charts')}>
        <article className="admin-dashboard-panel">
          <h2>{t('Properties by status')}</h2>
          {loading ? <DashboardSkeleton /> : chartTotal === 0 ? (
            <p className="admin-dashboard-empty">{t('No items yet')}</p>
          ) : (
            <div className="admin-dashboard-donut-layout">
              <div
                className="admin-dashboard-donut"
                style={{ background: `conic-gradient(${donutGradient})` }}
                role="img"
                aria-label={t('Properties by status')}
              >
                <span>{chartTotal.toLocaleString()}</span>
              </div>
              <ul className="admin-dashboard-legend">
                {donutSegments.map((segment) => (
                  <li key={segment.label}>
                    <span style={{ background: segment.color }} />
                    {segment.label}
                    <strong>{segment.value.toLocaleString()}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        <article className="admin-dashboard-panel">
          <h2>{t('New properties per month')}</h2>
          {loading ? <DashboardSkeleton /> : (
            monthlyProperties.length === 0 ? (
              <p className="admin-dashboard-empty">{t('No items yet')}</p>
            ) : (
              <div
                className="admin-dashboard-month-chart"
                data-single-month={monthlyProperties.length === 1 ? 'true' : undefined}
                style={{ gridTemplateColumns: `repeat(${monthlyProperties.length}, minmax(0, 1fr))` }}
              >
                {monthlyProperties.map((month) => (
                  <div className="admin-dashboard-month-column" key={month.key}>
                    <strong>{month.value}</strong>
                    <div className="admin-dashboard-month-track">
                      <span style={{ height: `${Math.max((month.value / maxMonthlyProperties) * 100, month.value ? 8 : 0)}%` }} />
                    </div>
                    <small>{month.label}</small>
                  </div>
                ))}
              </div>
            )
          )}
        </article>
      </section>

      <section className="admin-dashboard-lists">
        <article className="admin-dashboard-panel">
          <div className="admin-dashboard-panel-heading">
            <h2>{t('Waiting for review')}</h2>
            <Link to={canOpenPlatformSections ? '/admin-dashboard/review-properties' : '/admin-dashboard/pending'}>{t('View all')}</Link>
          </div>
          {loading ? renderSkeletonCards(3, 'admin-list-skeleton') : pendingProperties.length === 0 ? (
            <p className="admin-dashboard-empty">{t('No items yet')}</p>
          ) : (
            <ul className="admin-dashboard-review-list">
              {pendingProperties.map((property) => (
                <li key={property._id}>
                  <div>
                    <strong>{property.title || t('Untitled property')}</strong>
                    {(property.location || property.price != null) && (
                      <span>
                        {[property.location, property.price != null ? `ETB ${Number(property.price).toLocaleString()}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                    <span>{t('Owner')}: {property.landlord?.name || t('Unknown owner')}</span>
                    <time dateTime={property.createdAt}>{formatDate(property.createdAt)}</time>
                  </div>
                  <Link to={canOpenPlatformSections ? '/admin-dashboard/review-properties' : '/admin-dashboard/pending'}>{t('Review')}</Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        {!isPlatformAdmin && (
          <article className="admin-dashboard-panel admin-dashboard-rental-summary">
            <div className="admin-dashboard-panel-heading">
              <h2>{t('Rental requests')}</h2>
              <Link to="/admin-dashboard/rental-requests">{t('View all')}</Link>
            </div>
            {areaRentalRequestsError ? (
              <p className="admin-dashboard-inline-error" role="alert">{areaRentalRequestsError}</p>
            ) : loading || areaRentalRequests === null ? (
              renderSkeletonCards(3, 'admin-list-skeleton')
            ) : (
              <ul className="admin-dashboard-rental-counts">
                {[
                  ['Pending', rentalRequestCounts.pending],
                  ['Approved', rentalRequestCounts.approved],
                  ['Rejected', rentalRequestCounts.rejected],
                ].map(([label, count]) => (
                  <li key={label}>
                    <span>{t(label)}</span>
                    <strong>{count.toLocaleString()}</strong>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}

        {isPlatformAdmin && (
          <article className="admin-dashboard-panel">
            <div className="admin-dashboard-panel-heading">
              <h2>{t('Recent activity')}</h2>
              <Link to="/admin-dashboard/system-logs">{t('View all')}</Link>
            </div>
            {errors.logs ? (
              <p className="admin-dashboard-inline-error" role="alert">{errors.logs}</p>
            ) : loading || !platformData ? renderSkeletonCards(3, 'admin-list-skeleton') : recentLogs.length === 0 ? (
              <p className="admin-dashboard-empty">{t('No items yet')}</p>
            ) : (
              <ul className="admin-dashboard-activity-list">
                {recentLogs.slice(0, 5).map((log) => (
                  <li key={log._id}>
                    <FaFileAlt aria-hidden="true" />
                    <div>
                      <strong>{t(log.action || 'Activity')}</strong>
                      <span>{log.description}</span>
                      <time dateTime={log.createdAt}>{formatDate(log.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </section>

      <section className="admin-dashboard-panel admin-dashboard-quick-actions">
        <h2>{t('Quick Actions')}</h2>
        <div>
          <Link to={canOpenPlatformSections ? '/admin-dashboard/review-properties' : '/admin-dashboard/pending'}>
            <FaHourglassHalf aria-hidden="true" />{t('Review properties')}
          </Link>
          {isPlatformAdmin && (
            <Link to="/admin-dashboard/all-users"><FaUsers aria-hidden="true" />{t('Manage users')}</Link>
          )}
          {!isPlatformAdmin && (
            <>
              <Link to="/admin-dashboard/rental-requests">
                <FaClipboardList aria-hidden="true" />{t('Rental requests')}
              </Link>
              <Link to="/admin-dashboard/contact-messages">
                <FaEnvelope aria-hidden="true" />{t('Contact Messages')}
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
