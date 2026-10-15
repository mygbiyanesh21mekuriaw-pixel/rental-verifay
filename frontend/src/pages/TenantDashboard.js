import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { FaBell, FaFileAlt, FaHeart, FaHome } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useDashboardLayout } from '../components/DashboardLayout';
import PropertyImage from '../components/PropertyImage';
import { getPropertyImages } from '../utils/propertyMedia';
import './TenantDashboard.css';

const createSectionState = () => ({
  items: null,
  unreadCount: 0,
  loading: true,
  error: '',
});

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
});

const getRequestStatus = (status) => {
  const normalized = String(status || 'pending').toLowerCase();
  if (normalized === 'approved' || normalized === 'confirmed') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'expired') return 'Expired';
  return 'Pending';
};

const formatRequestDate = (dateValue, formatDate) => {
  const date = dateValue ? new Date(dateValue) : null;
  return date && !Number.isNaN(date.getTime())
    ? formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
};

const SectionLoading = ({ label }) => (
  <div className="space-y-3 p-4" role="status" aria-label={label}>
    {[0, 1, 2].map((item) => (
      <div key={item} className="h-12 animate-pulse rounded-lg bg-slate-100" />
    ))}
    <span className="sr-only">{label}</span>
  </div>
);

const SectionRetry = ({ message, onRetry, t }) => (
  <div className="space-y-3 p-4" role="alert">
    <p className="m-0 text-sm text-red-700">{t(message)}</p>
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      {t('Retry')}
    </button>
  </div>
);

const EmptyState = ({ message, to, action, t }) => (
  <div className="px-4 py-8 text-center">
    <p className="mb-4 text-sm text-slate-500">{t(message)}</p>
    <Link
      to={to}
      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white no-underline transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      {t(action)}
    </Link>
  </div>
);

const TenantDashboard = () => {
  const { user } = useAuth();
  const { t, formatDate, formatCurrency } = useLanguage();
  const dashboardLayout = useDashboardLayout();
  const setTopbarUnreadCount = dashboardLayout?.setUnreadCount;
  const [properties, setProperties] = useState(createSectionState);
  const [requests, setRequests] = useState(createSectionState);
  const [favorites, setFavorites] = useState(createSectionState);
  const [notifications, setNotifications] = useState(createSectionState);
  const [notificationActionError, setNotificationActionError] = useState('');
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [markingReadId, setMarkingReadId] = useState(null);

  const today = new Date();
  const todayDateTime = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);
  const welcomeName = String(user?.name || t('Tenant')).trim();
  const capitalizedName = welcomeName
    ? `${welcomeName.charAt(0).toLocaleUpperCase()}${welcomeName.slice(1)}`
    : t('Tenant');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const loadProperties = useCallback(async () => {
    setProperties((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/properties?verified=true&availability=available`,
        getAuthConfig()
      );
      if (!Array.isArray(response.data)) throw new Error('Unexpected available properties response.');
      setProperties({ items: response.data, unreadCount: 0, loading: false, error: '' });
    } catch (error) {
      console.error('Unable to load tenant dashboard properties:', error);
      setProperties((current) => ({ ...current, loading: false, error: 'Unable to load available properties.' }));
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequests((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/rent-requests/my-requests`,
        getAuthConfig()
      );
      if (!Array.isArray(response.data)) throw new Error('Unexpected tenant rental requests response.');
      setRequests({ items: response.data, unreadCount: 0, loading: false, error: '' });
    } catch (error) {
      console.error('Unable to load tenant dashboard rental requests:', error);
      setRequests((current) => ({ ...current, loading: false, error: 'Unable to load recent rental requests.' }));
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    setFavorites((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/favorites`,
        getAuthConfig()
      );
      if (!Array.isArray(response.data)) throw new Error('Unexpected tenant favorites response.');
      setFavorites({ items: response.data, unreadCount: 0, loading: false, error: '' });
    } catch (error) {
      console.error('Unable to load tenant dashboard favorites:', error);
      setFavorites((current) => ({ ...current, loading: false, error: 'Unable to load favorite properties.' }));
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifications((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/notifications`,
        getAuthConfig()
      );
      const records = response.data?.notifications;
      if (!Array.isArray(records) || !Number.isFinite(Number(response.data?.unreadCount))) {
        throw new Error('Unexpected tenant notifications response.');
      }
      setNotifications({
        items: records,
        unreadCount: Number(response.data.unreadCount),
        loading: false,
        error: '',
      });
      setTopbarUnreadCount?.(Number(response.data.unreadCount));
    } catch (error) {
      console.error('Unable to load tenant dashboard notifications:', error);
      setNotifications((current) => ({ ...current, loading: false, error: 'Unable to load recent notifications.' }));
    }
  }, [setTopbarUnreadCount]);

  useEffect(() => {
    if (user?.role !== 'tenant') return undefined;
    loadProperties();
    loadRequests();
    loadFavorites();
    loadNotifications();
    return undefined;
  }, [user, loadProperties, loadRequests, loadFavorites, loadNotifications]);

  const markNotificationRead = async (notificationId) => {
    setNotificationActionError('');
    setMarkingReadId(notificationId);
    const wasUnread = notifications.items?.some(
      (notification) => notification._id === notificationId && !notification.read
    );
    try {
      await axios.put(
        `${process.env.REACT_APP_API_URL}/api/notifications/${notificationId}/read`,
        {},
        getAuthConfig()
      );
      setNotifications((current) => ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - (
          current.items?.some((notification) => notification._id === notificationId && !notification.read) ? 1 : 0
        )),
        items: current.items?.map((notification) => (
          notification._id === notificationId ? { ...notification, read: true } : notification
        )) || [],
      }));
      if (wasUnread) {
        setTopbarUnreadCount?.(Math.max(0, notifications.unreadCount - 1));
      }
    } catch (error) {
      console.error('Unable to mark tenant notification as read:', error);
      setNotificationActionError('Unable to mark the notification as read. Please try again.');
    } finally {
      setMarkingReadId(null);
    }
  };

  const markAllNotificationsRead = async () => {
    setNotificationActionError('');
    setMarkingAllRead(true);
    try {
      await axios.put(
        `${process.env.REACT_APP_API_URL}/api/notifications/read-all`,
        {},
        getAuthConfig()
      );
      setNotifications((current) => ({
        ...current,
        unreadCount: 0,
        items: current.items?.map((notification) => ({ ...notification, read: true })) || [],
      }));
      setTopbarUnreadCount?.(0);
    } catch (error) {
      console.error('Unable to mark tenant notifications as read:', error);
      setNotificationActionError('Unable to mark all notifications as read. Please try again.');
    } finally {
      setMarkingAllRead(false);
    }
  };

  const statCards = [
    {
      label: 'Available Properties',
      count: properties.loading ? undefined : properties.error ? '—' : properties.items?.length ?? 0,
      icon: <FaHome aria-hidden="true" />,
      iconClass: 'tenant-stat-icon-properties',
      to: '/tenant/verified-properties',
    },
    {
      label: 'Total Requests',
      count: requests.loading ? undefined : requests.error ? '—' : requests.items?.length ?? 0,
      icon: <FaFileAlt aria-hidden="true" />,
      iconClass: 'tenant-stat-icon-requests',
      to: '/tenant/rental-requests',
    },
    {
      label: 'Favorite Properties',
      count: favorites.loading ? undefined : favorites.error ? '—' : favorites.items?.length ?? 0,
      icon: <FaHeart aria-hidden="true" />,
      iconClass: 'tenant-stat-icon-favorites',
      to: '/tenant/favorites',
    },
    {
      label: 'Unread Notifications',
      count: notifications.loading ? undefined : notifications.error ? '—' : notifications.unreadCount,
      icon: <FaBell aria-hidden="true" />,
      iconClass: 'tenant-stat-icon-notifications',
      to: '/tenant/notifications',
    },
  ];

  return (
    <div className="tenant-container tenant-dashboard-home !m-0 !w-full !min-w-0 !max-w-none !p-0">
      <div className="space-y-5">
        <header className="dashboard-welcome-banner flex w-full min-w-0 flex-col gap-2 rounded-xl bg-green-700 p-4 text-white sm:flex-row sm:items-start sm:justify-between md:p-6">
          <h1 className="sr-only">{t('Tenant Dashboard')}</h1>
          <h2 className="m-0 text-xl font-bold leading-tight text-white sm:text-2xl">
            {t('Welcome back, ')}{capitalizedName}
          </h2>
          <time className="shrink-0 text-right text-xs font-medium leading-snug text-white/90 sm:pt-1" dateTime={todayDateTime}>
            {formatDate(today, { dateStyle: 'full' })}
          </time>
        </header>

        <section className="tenant-stats !mb-0 !grid-cols-1 !gap-4 sm:!grid-cols-2 lg:!grid-cols-4" aria-label={t('Dashboard statistics')}>
          {statCards.map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="tenant-stat-card group !min-h-[136px] !cursor-pointer !items-start !justify-between !text-left text-inherit no-underline transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <span className="tenant-stat-card-heading">
                <span className="tenant-stat-label">{t(card.label)}</span>
                <span className={`tenant-stat-icon ${card.iconClass}`}>{card.icon}</span>
              </span>
              {card.count === undefined ? (
                <span className="h-9 w-16 animate-pulse rounded bg-slate-200" aria-hidden="true" />
              ) : (
                <span className="tenant-stat-number">
                  {typeof card.count === 'number' ? card.count.toLocaleString() : card.count}
                </span>
              )}
            </Link>
          ))}
        </section>

        {favorites.error && (
          <section className="rounded-2xl border border-red-200 bg-white shadow-sm" aria-label={t('Favorite Properties')}>
            <SectionRetry message={favorites.error} onRetry={loadFavorites} t={t} />
          </section>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="tenant-recent-requests-title">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <h2 id="tenant-recent-requests-title" className="m-0 text-base font-bold text-slate-900">{t('Recent Rental Requests')}</h2>
              <Link to="/tenant/rental-requests" className="shrink-0 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{t('View all')}</Link>
            </div>
            {requests.loading ? (
              <SectionLoading label={t('Loading recent rental requests...')} />
            ) : requests.error ? (
              <SectionRetry message={requests.error} onRetry={loadRequests} t={t} />
            ) : requests.items.length === 0 ? (
              <EmptyState message="No rental requests yet." to="/tenant/search" action="Browse properties" t={t} />
            ) : (
              <ul className="m-0 divide-y divide-slate-100 p-0">
                {requests.items.slice(0, 5).map((request) => {
                  const status = getRequestStatus(request.status);
                  const statusColor = status === 'Approved'
                    ? 'bg-green-100 text-green-800'
                    : status === 'Rejected'
                      ? 'bg-red-100 text-red-800'
                      : status === 'Expired'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-amber-100 text-amber-800';
                  return (
                    <li key={request._id} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-semibold text-slate-900">{request.property?.title || request.propertyTitle || t('Property')}</p>
                        <p className="m-0 mt-1 text-xs text-slate-500">{formatRequestDate(request.createdAt, formatDate)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusColor}`}>{t(status)}</span>
                        {request._id ? (
                          <Link
                            to={`/tenant/rental-requests/${request._id}`}
                            className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            {t('View')}
                          </Link>
                        ) : (
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-xs text-red-700" role="alert">{t('Rental request not found.')}</span>
                            <Link
                              to="/tenant/rental-requests"
                              className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                              {t('Back to Rental Requests')}
                            </Link>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="tenant-recent-notifications-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <h2 id="tenant-recent-notifications-title" className="m-0 text-base font-bold text-slate-900">{t('Recent Notifications')}</h2>
              <div className="flex items-center gap-3">
                {notifications.unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    disabled={markingAllRead}
                    className="rounded-lg text-xs font-semibold text-blue-700 underline-offset-4 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {t(markingAllRead ? 'Updating...' : 'Mark all as read')}
                  </button>
                )}
                <Link to="/tenant/notifications" className="shrink-0 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{t('View all')}</Link>
              </div>
            </div>
            {notificationActionError && <p className="m-0 px-4 pt-3 text-sm text-red-700" role="alert">{t(notificationActionError)}</p>}
            {notifications.loading ? (
              <SectionLoading label={t('Loading recent notifications...')} />
            ) : notifications.error ? (
              <SectionRetry message={notifications.error} onRetry={loadNotifications} t={t} />
            ) : notifications.items.length === 0 ? (
              <EmptyState message="No recent notifications." to="/tenant/notifications" action="View notifications" t={t} />
            ) : (
              <ul className="m-0 divide-y divide-slate-100 p-0">
                {notifications.items.slice(0, 5).map((notification) => (
                  <li key={notification._id} className={`flex min-w-0 items-start justify-between gap-3 px-4 py-3 ${notification.read ? '' : 'bg-blue-50/70'}`}>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-semibold text-slate-900">{notification.propertyTitle || t('Property')}</p>
                      <p className="m-0 mt-1 line-clamp-2 text-sm text-slate-600">{notification.message}</p>
                      <p className="m-0 mt-1 text-xs text-slate-500">{formatRequestDate(notification.createdAt, formatDate)}</p>
                    </div>
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(notification._id)}
                        disabled={markingReadId === notification._id}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        {t(markingReadId === notification._id ? 'Updating...' : 'Mark as read')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="tenant-new-properties-title">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
            <h2 id="tenant-new-properties-title" className="m-0 text-base font-bold text-slate-900">{t('Newly Added Properties')}</h2>
            <Link to="/tenant/search" className="shrink-0 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{t('View all')}</Link>
          </div>
          {properties.loading ? (
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label={t('Loading newly added properties...')}>
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="animate-pulse overflow-hidden rounded-xl border border-slate-200">
                  <div className="h-32 bg-slate-200" />
                  <div className="space-y-2 p-3"><div className="h-4 rounded bg-slate-200" /><div className="h-4 w-2/3 rounded bg-slate-200" /></div>
                </div>
              ))}
              <span className="sr-only">{t('Loading newly added properties...')}</span>
            </div>
          ) : properties.error ? (
            <SectionRetry message={properties.error} onRetry={loadProperties} t={t} />
          ) : properties.items.length === 0 ? (
            <EmptyState message="No new properties available." to="/tenant/search" action="Browse properties" t={t} />
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
              {properties.items.slice(0, 4).map((property) => (
                <article key={property._id} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <PropertyImage
                    src={getPropertyImages(property)}
                    alt={property.title}
                    className="h-36 w-full object-cover"
                    fallbackClassName="flex h-36 w-full items-center justify-center bg-slate-100 text-sm text-slate-500"
                    fallbackText={t('No image available')}
                  />
                  <div className="space-y-2 p-3">
                    <h3 className="m-0 truncate text-sm font-bold text-slate-900">{property.title}</h3>
                    <p className="m-0 truncate text-sm text-slate-500">{property.location}</p>
                    <p className="m-0 text-sm font-bold text-slate-800">{formatCurrency(property.price)}</p>
                    <Link
                      to={`/property/${property._id}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white no-underline transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      {t('View')}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default TenantDashboard;
