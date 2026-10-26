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

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
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

const AdminSystemLogs = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 20,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [expandedRows, setExpandedRows] = useState([]);
  const [activityUser, setActivityUser] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const buildQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (role !== 'All') params.set('role', role);
    if (action !== 'All') params.set('action', action);
    if (status !== 'All') params.set('status', status);
    if (module !== 'All') params.set('module', module);
    if (searchParams.get('userId')) params.set('user', searchParams.get('userId'));
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('page', String(page));
    params.set('limit', '20');
    return params.toString();
  }, [search, role, action, status, module, dateFrom, dateTo, page, searchParams]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/admin/system-logs?${buildQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setLogs(response.data.logs || []);
      setPagination(response.data.pagination || {
        total: 0,
        page: 1,
        totalPages: 1,
        limit: 20,
        hasNextPage: false,
        hasPrevPage: false,
      });
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        navigate(err.response.status === 401 ? '/login' : '/permission-denied', { replace: true });
        return;
      }
      setError('Failed to load the audit log.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, navigate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setSearch('');
    setRole('All');
    setAction('All');
    setStatus('All');
    setModule('All');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    setSearchParams({});
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
        { headers: { Authorization: 'Bearer ' + token } },
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
        { headers: { Authorization: 'Bearer ' + token }, responseType: 'blob' },
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

  const toggleRow = (logId) => {
    setExpandedRows((current) =>current.includes(logId)
        ? current.filter((item) =>item !== logId)
        : [...current, logId]
    );
  };

  return (
    <div className="system-logs-page w-full min-w-0 max-w-none px-0 py-4">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <span></span>
          <span>{t('Audit Log')}</span>
        </h1>
        <p className="mt-2 text-slate-600">{t('Review user activity and important changes made in the House Rental Management System.')}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
          <div className="xl:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) =>setSearch(e.target.value)}
              className="system-logs-search-input w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              placeholder="Search description or action"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Role</label>
            <select
              value={role}
              onChange={(e) =>setRole(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'All' : getRoleLabel(option)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Action</label>
            <select
              value={action}
              onChange={(e) =>setAction(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="All">All</option>
              {ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Module</label>
            <select value={module} onChange={(e) => setModule(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
              {MODULE_OPTIONS.map((option) => <option key={option} value={option}>{option === 'All' ? 'All' : option.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</label>
            <select
              value={status}
              onChange={(e) =>setStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'All' : option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) =>setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) =>setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="system-logs-filter-actions mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={exportCsv} className="system-logs-filter-button inline-flex items-center justify-center rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Export CSV</button>
          <button
            type="button"
            onClick={handleSearch}
            className="system-logs-filter-button system-logs-search-button inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >Search
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            className="system-logs-filter-button system-logs-clear-button inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >Clear Filters
          </button>
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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Date & Time</th>
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
                    const isExpanded = expandedRows.includes(log._id);
                    const userName = log.user?.name || log.actorName || 'System';
                    return (
                      <React.Fragment key={log._id}>
                        <tr
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() =>toggleRow(log._id)}
                        >
                          <td className="px-4 py-3 text-sm text-slate-700">{formatDateTime(log.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {log.user ? <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={(event) => { event.stopPropagation(); openActivity(log.user); }}>{userName}</button> : userName}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">{getRoleLabel(log.role)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 font-medium">{log.action}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{log.module || '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{log.targetLabel || log.property?.title || '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 max-w-md truncate">{log.description}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                              log.status === 'success'
                                ? 'bg-emerald-100 text-emerald-700'
                                : log.status === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50">
                            <td colSpan={8} className="px-4 py-4 text-sm text-slate-700">
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                <div><strong>User:</strong> {userName}</div>
                                <div><strong>Role:</strong> {getRoleLabel(log.role)}</div>
                                <div><strong>Action:</strong> {log.action}</div>
                                <div><strong>Module:</strong> {log.module || '—'}</div>
                                <div><strong>Target:</strong> {log.targetLabel || log.property?.title || '—'}</div>
                                <div className="md:col-span-2"><strong>Description:</strong> {log.description}</div>
                                <div><strong>Status:</strong> {log.status}</div>
                                <div><strong>Date/Time:</strong> {formatDateTime(log.createdAt)}</div>
                              </div>

                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200 text-sm text-slate-600">
              <div>Showing {logs.length ? (pagination.page - 1) * pagination.limit + 1 : 0}{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} logs
              </div>
              <div className="system-logs-pagination flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>setPage((current) =>Math.max(1, current - 1))}
                  disabled={!pagination.hasPrevPage}
                  className="system-logs-page-button rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >Previous
                </button>
                <span className="system-logs-page-indicator rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700">Page {pagination.page}
                </span>
                <button
                  type="button"
                  onClick={() =>setPage((current) =>current + 1)}
                  disabled={!pagination.hasNextPage}
                  className="system-logs-page-button rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >Next
                </button>
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
                <p className="mt-1 text-sm text-slate-600">{activityUser.name} {activityUser.email ? `(${activityUser.email})` : ''}</p>
              </div>
              <button type="button" onClick={() => setActivityUser(null)} aria-label="Close timeline" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Close</button>
            </div>
            {activityLoading ? <p role="status">Loading activity…</p> : activityLogs.length === 0 ? <p className="text-sm text-slate-600">No activity recorded.</p> : (
              <div className="space-y-5">
                {Object.entries(activityLogs.reduce((groups, log) => {
                  const session = log.sessionId || 'Legacy activity';
                  groups[session] = groups[session] || [];
                  groups[session].push(log);
                  return groups;
                }, {})).map(([session, entries]) => (
                  <section key={session} className="rounded-xl border border-slate-200 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-800">{session === 'Legacy activity' ? session : `Session ${session.slice(0, 8)}`}</h3>
                    <ol className="space-y-3">
                      {entries.map((entry) => (
                        <li key={entry._id} className="flex gap-3">
                          <span aria-hidden="true" className={`mt-0.5 shrink-0 ${entry.status === 'success' ? 'text-emerald-600' : entry.status === 'failed' ? 'text-red-600' : 'text-orange-600'}`}>
                            {entry.status === 'success' ? <FaCheckCircle /> : entry.status === 'failed' ? <FaTimesCircle /> : <FaExclamationTriangle />}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{entry.action} <span className="font-normal text-slate-500">· {entry.status}</span></p>
                            <p className="text-sm text-slate-600">{entry.description}</p>
                            <time className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default AdminSystemLogs;
