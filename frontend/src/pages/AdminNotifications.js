import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  FaBell,
  FaBuilding,
  FaCalendarAlt,
  FaCheckCircle,
  FaEnvelope,
  FaExclamationCircle,
  FaFileAlt,
  FaTrashAlt,
} from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import BackToDashboard from '../components/BackToDashboard';
import { apiUrl } from '../utils/apiUrl';
import './adminNotifications.css';

const PAGE_SIZE = 20;
const CATEGORY_CONFIG = {
  properties: { label: 'Properties', Icon: FaBuilding, action: 'Review property' },
  rentals: { label: 'Rentals', Icon: FaFileAlt, action: 'Open rental request' },
  messages: { label: 'Messages', Icon: FaEnvelope, action: 'Open message' },
  system: { label: 'System', Icon: FaExclamationCircle, action: 'View details' },
};
const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  ...Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({ key, label: config.label })),
];
const EMPTY_TOTALS = {
  total: 0,
  unread: 0,
  byType: Object.fromEntries(Object.keys(CATEGORY_CONFIG).map((key) => [key, { total: 0, unread: 0 }])),
};

const getLocale = (language) => ({
  en: 'en-ET',
  am: 'am-ET',
  om: 'om-ET',
  ti: 'ti-ET',
  sid: 'sid-ET',
}[language] || 'en-ET');

const getDayKey = (date) => {
  const today = new Date();
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysAgo = Math.round((todayDay - dateDay) / 86400000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return 'Earlier';
};

const getRelativeTime = (date, locale) => {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const [unit, interval] = units.find(([, secondsInUnit]) => absSeconds >= secondsInUnit) || ['second', 1];
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(seconds / interval), unit);
};

const getNotificationTarget = (notification, isAreaAdmin) => {
  const propertyId = notification.property?.id;
  if (notification.category === 'rentals' && notification.rentalRequest) {
    return `/admin-dashboard/rental-requests`;
  }
  if (notification.category === 'properties' && notification.type === 'pending') {
    return isAreaAdmin ? '/admin-dashboard/pending' : '/admin-dashboard/all-properties';
  }
  return propertyId ? '/admin-dashboard/all-properties' : '/admin-dashboard';
};

const AdminNotifications = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const isAreaAdmin = user?.adminType === 'area' ||
    (user?.effectiveRole === 'area_admin') ||
    (user?.role === 'area_admin');
  const [notifications, setNotifications] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingRead, setClearingRead] = useState(false);
  const locale = getLocale(language);

  const broadcastUnreadCount = useCallback((count) => {
    window.dispatchEvent(new CustomEvent('notifications:unread-count', {
      detail: { unreadCount: Math.max(0, Number(count) || 0) },
    }));
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (activeFilter === 'unread') params.unread = true;
      else if (activeFilter !== 'all') params.type = activeFilter;
      const response = await axios.get(apiUrl('/api/notifications'), { params });
      const result = response.data || {};
      setNotifications(Array.isArray(result.notifications) ? result.notifications : []);
      setTotals({ ...EMPTY_TOTALS, ...(result.totals || {}) });
      setPages(Math.max(1, Number(result.pagination?.pages || 1)));
      broadcastUnreadCount(result.unreadCount ?? result.totals?.unread ?? 0);
    } catch (error) {
      setLoadError(error.response?.data?.message || t('Unable to load notifications right now.'));
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, broadcastUnreadCount, page, t]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = async (notification) => {
    if (notification.read) return;
    setActionError('');
    try {
      await axios.put(apiUrl(`/api/notifications/${notification._id}/read`), {});
      setNotifications((current) => current.map((item) => (
        item._id === notification._id ? { ...item, read: true } : item
      )));
      setTotals((current) => {
        const byType = { ...current.byType };
        if (byType[notification.category]) {
          byType[notification.category] = {
            ...byType[notification.category],
            unread: Math.max(0, byType[notification.category].unread - 1),
          };
        }
        const unread = Math.max(0, current.unread - 1);
        broadcastUnreadCount(unread);
        return { ...current, unread, byType };
      });
    } catch (error) {
      setActionError(error.response?.data?.message || t('Unable to mark the notification as read. Please try again.'));
    }
  };

  const handleOpenNotification = async (event, notification) => {
    event.stopPropagation();
    event.preventDefault();
    await markRead(notification);
    navigate(getNotificationTarget(notification, isAreaAdmin));
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    setActionError('');
    try {
      await axios.put(apiUrl('/api/notifications/read-all'), {});
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
      setTotals((current) => ({
        ...current,
        unread: 0,
        byType: Object.fromEntries(Object.entries(current.byType).map(([key, value]) => [
          key, { ...value, unread: 0 },
        ])),
      }));
      broadcastUnreadCount(0);
    } catch (error) {
      setActionError(error.response?.data?.message || t('Unable to mark all notifications as read. Please try again.'));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClearRead = async () => {
    if (!window.confirm(t('Clear all read notifications?'))) return;
    setClearingRead(true);
    setActionError('');
    try {
      await axios.delete(apiUrl('/api/notifications/read'));
      await fetchNotifications();
    } catch (error) {
      setActionError(error.response?.data?.message || t('Unable to clear read notifications.'));
    } finally {
      setClearingRead(false);
    }
  };

  const groupedNotifications = useMemo(() => {
    const groups = { Today: [], Yesterday: [], Earlier: [] };
    notifications.forEach((notification) => {
      const date = new Date(notification.createdAt);
      if (!Number.isNaN(date.getTime())) groups[getDayKey(date)].push(notification);
      else groups.Earlier.push(notification);
    });
    return groups;
  }, [notifications]);

  const handleTabKeyDown = (event, currentIndex) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? FILTER_TABS.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : FILTER_TABS.length - 1)) % FILTER_TABS.length;
    const next = FILTER_TABS[nextIndex];
    setActiveFilter(next.key);
    setPage(1);
    document.getElementById(`admin-notification-tab-${next.key}`)?.focus();
  };

  const renderNotification = (notification) => {
    const config = CATEGORY_CONFIG[notification.category] || CATEGORY_CONFIG.system;
    const Icon = config.Icon;
    const createdAt = new Date(notification.createdAt);
    const validDate = !Number.isNaN(createdAt.getTime());
    const target = getNotificationTarget(notification, isAreaAdmin);
    return (
      <article
        key={notification._id}
        className={`admin-notification-item${notification.read ? '' : ' is-unread'}`}
        onClick={() => markRead(notification)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          markRead(notification);
        }}
        tabIndex={0}
        aria-label={`${notification.propertyTitle || t('Notification')}. ${notification.message || ''}${notification.read ? '' : `. ${t('Unread')}`}`}
      >
        <button
          type="button"
          className="admin-notification-main"
          onClick={(event) => {
            event.stopPropagation();
            markRead(notification);
          }}
          aria-label={t('Mark notification as read')}
        >
          <span className={`admin-notification-icon is-${notification.category || 'system'}`} aria-hidden="true">
            <Icon />
          </span>
          <span className="admin-notification-copy">
            <strong>{notification.propertyTitle || t('Notification')}</strong>
            <span className="admin-notification-description">{notification.message || t('No description available.')}</span>
            {validDate && (
              <time
                className="admin-notification-time"
                dateTime={createdAt.toISOString()}
                title={new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(createdAt)}
              >
                <FaCalendarAlt aria-hidden="true" />
                {getRelativeTime(createdAt, locale)}
              </time>
            )}
          </span>
          {!notification.read && <span className="admin-notification-dot" aria-label={t('Unread')} />}
        </button>
        <Link
          className="admin-notification-action"
          to={target}
          onClick={(event) => handleOpenNotification(event, notification)}
        >
          {t(config.action)}
        </Link>
      </article>
    );
  };

  const emptyTitle = activeFilter === 'unread'
    ? 'You’re all caught up'
    : activeFilter === 'all'
      ? 'You’re all caught up'
      : 'No notifications in this category';

  return (
    <main className="admin-notifications-page">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <header className="admin-notifications-heading">
        <div>
          <p className="admin-notifications-eyebrow">{t(isAreaAdmin ? 'Area Admin' : 'Platform Admin')}</p>
          <h1>{t('Notifications')}</h1>
          <p>{t('Stay up to date with activity and items that need attention.')}</p>
        </div>
        <div className="admin-notifications-header-actions">
          <span className="admin-notifications-unread-count" aria-live="polite">
            <FaBell aria-hidden="true" />
            {t('{count} unread', { count: totals.unread })}
          </span>
          <button type="button" className="admin-notifications-button is-primary" onClick={handleMarkAllRead} disabled={!totals.unread || markingAll}>
            {markingAll ? t('Updating...') : t('Mark all as read')}
          </button>
          <button type="button" className="admin-notifications-button is-secondary" onClick={handleClearRead} disabled={clearingRead}>
            <FaTrashAlt aria-hidden="true" />
            {clearingRead ? t('Clearing...') : t('Clear read')}
          </button>
        </div>
      </header>

      <nav className="admin-notifications-tabs" role="tablist" aria-label={t('Filter notifications')}>
        {FILTER_TABS.map((tab, index) => {
          const count = tab.key === 'all'
            ? totals.total
            : tab.key === 'unread'
              ? totals.unread
              : totals.byType?.[tab.key]?.total || 0;
          return (
            <button
              id={`admin-notification-tab-${tab.key}`}
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab.key}
              aria-controls="admin-notifications-list"
              tabIndex={activeFilter === tab.key ? 0 : -1}
              onClick={() => { setActiveFilter(tab.key); setPage(1); }}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {t(tab.label)} <span>{count}</span>
            </button>
          );
        })}
      </nav>

      {actionError && <p className="admin-notifications-error" role="alert">{t(actionError)}</p>}
      <section id="admin-notifications-list" className="admin-notifications-list" role="tabpanel" aria-labelledby={`admin-notification-tab-${activeFilter}`}>
        {loading ? (
          <div className="admin-notifications-skeleton" aria-label={t('Loading notifications...')} aria-busy="true">
            {[0, 1, 2, 3].map((item) => <div key={item} className="admin-notification-skeleton-row" />)}
          </div>
        ) : loadError ? (
          <div className="admin-notifications-empty is-error" role="alert">
            <FaExclamationCircle aria-hidden="true" />
            <p>{t(loadError)}</p>
            <button type="button" className="admin-notifications-button is-secondary" onClick={fetchNotifications}>{t('Try again')}</button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="admin-notifications-empty">
            <span className="admin-notifications-empty-icon">
              <FaCheckCircle aria-hidden="true" />
            </span>
            <h2>{t(emptyTitle)}</h2>
            <p>{t(activeFilter === 'all' || activeFilter === 'unread'
              ? 'There are no new notifications right now.'
              : 'No notifications match this filter.')}</p>
          </div>
        ) : (
          <>
            {Object.entries(groupedNotifications).map(([groupName, items]) => items.length > 0 && (
              <section key={groupName} className="admin-notification-date-group" aria-labelledby={`admin-notifications-${groupName.toLowerCase()}`}>
                <h2 id={`admin-notifications-${groupName.toLowerCase()}`}>{t(groupName)}</h2>
                <div>{items.map(renderNotification)}</div>
              </section>
            ))}
            {pages > 1 && (
              <div className="admin-notifications-pagination">
                <span>{t('Page {page} of {pages}', { page, pages })}</span>
                <div>
                  <button type="button" className="admin-notifications-button is-secondary" onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>{t('Previous')}</button>
                  <button type="button" className="admin-notifications-button is-secondary" onClick={() => setPage((current) => current + 1)} disabled={page >= pages}>{t('Next')}</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
};

export default AdminNotifications;
