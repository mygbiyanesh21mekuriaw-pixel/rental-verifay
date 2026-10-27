import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from 'react-icons/fa';
import BackToDashboard from '../components/BackToDashboard';
import { useLanguage } from '../context/LanguageContext';
import './AdminSystemLogs.css';

const ACTION_OPTIONS = [
  'USER_REGISTERED',
  'USER_LOGIN',
  'USER_DEACTIVATED',
  'USER_ACTIVATED',
  'USER_SUSPENDED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'PERMISSION_DENIED',
  'USER_APPROVED',
  'USER_PERMISSIONS_UPDATED',
  'AREA_ADMIN_CREATED',
  'AREA_ADMIN_DEMOTED',
  'AREA_ADMIN_DEACTIVATED',
  'AREA_ADMIN_ACTIVATED',
  'AREA_ADMIN_LINKED_EXISTING_ACCOUNT',
  'USER_LOGOUT',
  'PROPERTY_CREATED',
  'PROPERTY_UPDATED',
  'PROPERTY_DELETED',
  'PROPERTY_VERIFIED',
  'PROPERTY_REJECTED',
  'RENTAL_REQUEST_CREATED',
  'RENTAL_REQUEST_APPROVED',
  'RENTAL_REQUEST_ACCEPTED',
  'RENTAL_REQUEST_REJECTED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'USER_ROLE_UPDATED',
  'USER_UPDATED',
  'USER_DELETED',
  'NOTIFICATION_CREATED',
  'FAVORITE_ADDED',
  'FAVORITE_REMOVED',
  'REVIEW_CREATED',
  'BANK_INFORMATION_CHANGED',
  'SYSTEM_SETTINGS_CHANGED',
];

const ROLE_OPTIONS = ['All', 'platform_admin', 'area_admin', 'landlord', 'tenant', 'admin'];
const STATUS_OPTIONS = ['All', 'success', 'failed', 'denied', 'pending'];
const MODULE_OPTIONS = ['All', 'auth', 'users', 'permissions', 'properties', 'rentals', 'payments', 'favorites', 'reviews', 'bank_information', 'system_settings'];
const IMPORTANT_ACTIONS = new Set([
  'USER_ROLE_UPDATED',
  'USER_PERMISSIONS_UPDATED',
  'PASSWORD_RESET',
  'USER_DEACTIVATED',
  'AREA_ADMIN_DEMOTED',
  'AREA_ADMIN_CREATED',
  'AREA_ADMIN_DEACTIVATED',
  'USER_SUSPENDED',
]);

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(',', '');
};

const getRoleLabel = (role) => {
  if (!role) return 'Unknown';
  return role.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};

const formatActionLabel = (action) => {
  if (!action) return 'Unknown action';
  return action.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const getStatusClasses = (status) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'denied':
      return 'bg-rose-100 text-rose-700';
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

const getActionBadge = (status) => {
  switch (status) {
    case 'failed':
      return <FaTimesCircle className="text-red-500" aria-hidden="true" />;
    case 'pending':
      return <FaExclamationTriangle className="text-amber-500" aria-hidden="true" />;
    default:
      return <FaCheckCircle className="text-emerald-500" aria-hidden="true" />;
  }
};

const normalizeDescription = (log) => {
  const rawText = log?.description || '';
  const targetText = log?.targetLabel || log?.property?.title || '';
  if (!targetText) return rawText;
  const cleaned = rawText.replace(new RegExp(targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim();
  return cleaned || rawText;
};

const getSelectedLogValues = (log) => {
  if (!log) return { before: null, after: null };
  const details = log.details || {};
  const before = details.before ?? details.oldValue ?? details.previous ?? details.old ?? null;
  const after = details.after ?? details.newValue ?? details.updated ?? details.next ?? details.new ?? null;
  return { before, after };
};

const AdminSystemLogs = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('All');
  const [action, setAction] = useState('All');
  const [status, setStatus] = useState('All');
  const [module, setModule] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [importantOnly, setImportantOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 25,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [totals, setTotals] = useState({ total: 0, success: 0, failed: 0, adminChanges: 0 });
  const [selectedLog, setSelectedLog] = useState(null);
  const [activityUser, setActivityUser] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const buildQuery = useMemo(() => {
    const params = new URLSearchParams();
    const trimmedSearch = search.trim();
    if (trimmedSearch) params.set('q', trimmedSearch);
    if (role !== 'All') params.set('role', role);
    if (action !== 'All') params.set('action', action);
    if (status !== 'All') params.set('status', status);
    if (module !== 'All') params.set('module', module);
    if (importantOnly) params.set('important', 'true');
    if (searchParams.get('userId')) params.set('user', searchParams.get('userId'));
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('limit', '25');
    return params.toString();
  }, [action, dateFrom, dateTo, importantOnly, module, page, role, search, searchParams, sort, status]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/admin/system-logs?${buildQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setLogs(response.data.logs || []);
      setTotals(response.data.totals || { total: 0, success: 0, failed: 0, adminChanges: 0 });
      setPagination(response.data.pagination || {
        total: 0,
        page: 1,
        totalPages: 1,
        limit: 25,
        hasNextPage: false,
        hasPrevPage: false,
      });
    } catch (requestError) {
      if (requestError.response?.status === 401 || requestError.response?.status === 403) {
        navigate(requestError.response.status === 401 ? '/login' : '/permission-denied', { replace: true });
        return;
      }
      setError('Failed to load the audit log.');
      setLogs([]);
      setTotals({ total: 0, success: 0, failed: 0, adminChanges: 0 });
    } finally {
      setLoading(false);
    }
  }, [buildQuery, navigate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    setPage(1);
  };

  const handleQuickRange = (range) => {
    const today = new Date();
    const toValue = today.toISOString().slice(0, 10);
    if (range === 'today') {
      setDateFrom(toValue);
      setDateTo(toValue);
      return;
    }
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(toValue);
  };

  const handleClearFilters = () => {
    setSearch('');
    setRole('All');
    setAction('All');
    setStatus('All');
    setModule('All');
    setDateFrom('');
    setDateTo('');
    setImportantOnly(false);
    setSort('newest');
    setPage(1);
  };

  const openActivity = async (logUser) => {
    const userId = logUser?._id || logUser?.id;
    if (!userId) return;
    setActivityUser(logUser);
    setActivityLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/admin/system-logs/user/${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setActivityLogs(response.data.logs || []);
    } catch (requestError) {
      setError('Failed to load user activity timeline.');
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const exportCsv = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/admin/system-logs/export?${buildQuery}`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' },
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'audit-log.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError('Failed to export audit log.');
    }
  };

  const summaryCards = [
    { label: t('Total events'), value: totals.total || 0 },
    { label: t('Successful'), value: totals.success || 0 },
    { label: t('Failed'), value: totals.failed || 0 },
    { label: t('Admin changes'), value: totals.adminChanges || 0 },
  ];

  return (
    <div className="system-logs-page w-full min-w-0 max-w-none px-0 py-4">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <span>{t('Audit Log')}</span>
        </h1>
        <p className="mt-2 text-slate-600">{t('Review user activity and important changes made in the House Rental Management System.')}</p>
      </div>

      <div className="audit-log-summary-grid mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="audit-log-chip-button rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => handleQuickRange('today')}>{t('Today')}</button>
            <button type="button" className="audit-log-chip-button rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => handleQuickRange('week')}>{t('Last 7 days')}</button>
            <button type="button" className="audit-log-chip-button rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => { setStatus('failed'); setPage(1); }}>{t('Failed only')}</button>
            <button type="button" className={`audit-log-chip-button rounded-full border px-3 py-1.5 text-xs font-semibold ${importantOnly ? 'border-amber-600 bg-amber-50 text-amber-700' : 'border-slate-300 bg-slate-50 text-slate-700'}`} onClick={() => { setImportantOnly((current) => !current); setPage(1); }}>{t('Important only')}</button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t('Search')}</label>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="system-logs-search-input w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                placeholder="Search description or action"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t('Role')}</label>
              <select value={role} onChange={(event) => setRole(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                {ROLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option === 'All' ? 'All' : getRoleLabel(option)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t('Action')}</label>
              <select value={action} onChange={(event) => setAction(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                <option value="All">All</option>
                {ACTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{formatActionLabel(option)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t('Module')}</label>
              <select value={module} onChange={(event) => setModule(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                {MODULE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option === 'All' ? 'All' : option.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t('Status')}</label>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option === 'All' ? 'All' : option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t('From')}</label>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t('To')}</label>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" />
            </div>
          </div>

          <div className="system-logs-filter-actions flex flex-wrap gap-3">
            <button type="button" onClick={exportCsv} className="system-logs-filter-button inline-flex items-center justify-center rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Export CSV</button>
            <button type="button" onClick={handleSearch} className="system-logs-filter-button system-logs-search-button inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition">{t('Search')}</button>
            <button type="button" onClick={handleClearFilters} className="system-logs-filter-button system-logs-clear-button inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">{t('Clear filters')}</button>
            <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">{pagination.total || 0} {t('results')}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-600">Loading audit log...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-600">No audit log entries found.</div>
        ) : (
          <>
            <div className="audit-log-desktop hidden md:block">
              <table className="audit-log-table min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <button type="button" className="font-semibold" onClick={() => setSort((current) => (current === 'newest' ? 'oldest' : 'newest'))}>Date & Time</button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Module</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {logs.map((log) => {
                    const userName = log.user?.name || log.actorName || 'System';
                    const description = normalizeDescription(log);
                    return (
                      <React.Fragment key={log._id || `${log.createdAt}-${log.action}`}>
                        <tr className="cursor-pointer transition hover:bg-slate-50" onClick={() => setSelectedLog(log)}>
                          <td className="px-4 py-3 text-sm text-slate-700">{formatDateTime(log.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {log.user || log.actorName ? (
                              <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={(event) => { event.stopPropagation(); openActivity(log.user || { _id: '', name: userName }); }}>
                                {userName}
                              </button>
                            ) : (
                              <span>{userName}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{getRoleLabel(log.role)}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            <div className="flex items-center gap-2 font-medium">
                              {getActionBadge(log.status)}
                              <span>{formatActionLabel(log.action)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">{log.module || '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{log.targetLabel || log.property?.title || '—'}</td>
                          <td className="max-w-md px-4 py-3 text-sm text-slate-700">{description || '—'}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusClasses(log.status)}`}>
                              {log.status || 'success'}
                            </span>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="audit-log-mobile md:hidden">
              {logs.map((log) => {
                const userName = log.user?.name || log.actorName || 'System';
                const description = normalizeDescription(log);
                return (
                  <article key={log._id || `${log.createdAt}-${log.action}`} className="border-b border-slate-200 px-4 py-4" onClick={() => setSelectedLog(log)}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-base font-bold text-slate-900">{log.targetLabel || log.property?.title || 'System event'}</div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusClasses(log.status)}`}>{log.status || 'success'}</span>
                    </div>
                    <div className="space-y-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-500">Amount</span><span className="font-bold text-slate-900">{log.action ? formatActionLabel(log.action) : 'Audit event'}</span></div>
                      <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-500">Tenant</span><span>{userName}</span></div>
                      <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-500">Property</span><span>{log.module || '—'}</span></div>
                      <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-500">Period</span><span>{formatDateTime(log.createdAt)}</span></div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">{description || '—'}</div>
                  </article>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
              <div>
                {pagination.total > 0
                  ? `Showing ${(pagination.page - 1) * pagination.limit + 1} to ${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} logs`
                  : 'No logs to show'}
              </div>
              <div className="system-logs-pagination flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={!pagination.hasPrevPage} className="system-logs-page-button rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                <span className="system-logs-page-indicator rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700">Page {pagination.page}</span>
                <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!pagination.hasNextPage} className="system-logs-page-button rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {activityUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" role="presentation" onClick={() => setActivityUser(null)}>
          <aside role="dialog" aria-modal="true" aria-label="User activity timeline" className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">User activity timeline</h2>
                <p className="mt-1 text-sm text-slate-600">{activityUser.name || 'System user'} {activityUser.email ? `(${activityUser.email})` : ''}</p>
              </div>
              <button type="button" onClick={() => setActivityUser(null)} aria-label="Close timeline" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Close</button>
            </div>
            {activityLoading ? <p role="status">Loading activity…</p> : activityLogs.length === 0 ? <p className="text-sm text-slate-600">No activity recorded.</p> : (
              <div className="space-y-5">
                {activityLogs.map((log) => (
                  <div key={log._id || `${log.createdAt}-${log.action}`} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">{formatActionLabel(log.action)}</span>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${getStatusClasses(log.status)}`}>{log.status || 'success'}</span>
                    </div>
                    <div className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</div>
                    <p className="mt-2 text-sm text-slate-700">{log.description}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" role="presentation" onClick={() => setSelectedLog(null)}>
          <aside role="dialog" aria-modal="true" aria-label="Audit log details" className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Audit log details</h2>
                <p className="mt-1 text-sm text-slate-600">{formatActionLabel(selectedLog.action)}</p>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} aria-label="Close details" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Close</button>
            </div>

            <dl className="space-y-3 text-sm text-slate-700">
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">Actor</dt><dd>{selectedLog.actorName || selectedLog.user?.name || 'System'}</dd></div>
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">Role</dt><dd>{getRoleLabel(selectedLog.role)}</dd></div>
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">Target</dt><dd>{selectedLog.targetLabel || selectedLog.property?.title || '—'}</dd></div>
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">Time</dt><dd>{formatDateTime(selectedLog.createdAt)}</dd></div>
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">Module</dt><dd>{selectedLog.module || '—'}</dd></div>
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">Status</dt><dd><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusClasses(selectedLog.status)}`}>{selectedLog.status || 'success'}</span></dd></div>
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">IP</dt><dd>{selectedLog.ipAddress || selectedLog.ip || '—'}</dd></div>
              <div className="flex justify-between gap-3 border-b border-slate-200 pb-2"><dt className="font-medium text-slate-500">User agent</dt><dd className="break-all text-right">{selectedLog.userAgent || '—'}</dd></div>
            </dl>

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Description</div>
              <p className="text-sm text-slate-700">{selectedLog.description}</p>
            </div>

            {(() => {
              const { before, after } = getSelectedLogValues(selectedLog);
              if (!before && !after) return null;
              return (
                <div className="mt-5 space-y-3">
                  <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Before / after</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Before</div>
                      <pre className="whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(before, null, 2)}</pre>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">After</div>
                      <pre className="whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(after, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              );
            })()}
          </aside>
        </div>
      )}
    </div>
  );
};

export default AdminSystemLogs;
