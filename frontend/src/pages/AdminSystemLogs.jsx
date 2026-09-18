import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const ACTION_OPTIONS = [
  'USER_REGISTERED',
  'USER_LOGIN',
  'USER_LOGOUT',
  'PROPERTY_CREATED',
  'PROPERTY_UPDATED',
  'PROPERTY_DELETED',
  'PROPERTY_VERIFIED',
  'PROPERTY_REJECTED',
  'RENTAL_REQUEST_CREATED',
  'RENTAL_REQUEST_APPROVED',
  'RENTAL_REQUEST_REJECTED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'USER_ROLE_UPDATED',
  'USER_UPDATED',
  'USER_DELETED',
  'NOTIFICATION_CREATED',
];

const ROLE_OPTIONS = ['All', 'admin', 'landlord', 'tenant'];
const STATUS_OPTIONS = ['All', 'success', 'failed', 'pending'];

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
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const AdminSystemLogs = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('All');
  const [action, setAction] = useState('All');
  const [status, setStatus] = useState('All');
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

  const buildQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (role !== 'All') params.set('role', role);
    if (action !== 'All') params.set('action', action);
    if (status !== 'All') params.set('status', status);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('page', String(page));
    params.set('limit', '20');
    return params.toString();
  }, [search, role, action, status, dateFrom, dateTo, page]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/api/admin/system-logs?${buildQuery}`, {
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
        navigate('/login', { replace: true });
        return;
      }
      setError('❌ Failed to load system logs.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [buildQuery, navigate]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setSearch('');
    setRole('All');
    setAction('All');
    setStatus('All');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const toggleRow = (logId) => {
    setExpandedRows((current) =>
      current.includes(logId)
        ? current.filter((item) => item !== logId)
        : [...current, logId]
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <span>📋</span>
          <span>System Logs</span>
        </h1>
        <p className="mt-2 text-slate-600">
          View important activities and changes made in the House Rental Management System.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
          <div className="xl:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
              placeholder="Search description or action"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
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
              onChange={(e) => setAction(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="All">All</option>
              {ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
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
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >
            🔎 Search
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            🧹 Clear Filters
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
          <div className="p-8 text-center text-slate-600">⏳ Loading system logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-600">📋 No system logs found.</div>
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
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {logs.map((log) => {
                    const isExpanded = expandedRows.includes(log._id);
                    const userName = log.user?.name || 'System';
                    return (
                      <React.Fragment key={log._id}>
                        <tr
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => toggleRow(log._id)}
                        >
                          <td className="px-4 py-3 text-sm text-slate-700">{formatDateTime(log.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{userName}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{getRoleLabel(log.role)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 font-medium">{log.action}</td>
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
                            <td colSpan={6} className="px-4 py-4 text-sm text-slate-700">
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                <div><strong>User:</strong> {userName}</div>
                                <div><strong>Role:</strong> {getRoleLabel(log.role)}</div>
                                <div><strong>Action:</strong> {log.action}</div>
                                <div className="md:col-span-2"><strong>Description:</strong> {log.description}</div>
                                <div><strong>Property ID:</strong> {log.property || '—'}</div>
                                <div><strong>Rental Request ID:</strong> {log.rentalRequest || '—'}</div>
                                <div><strong>Payment ID:</strong> {log.payment || '—'}</div>
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
              <div>
                Showing {logs.length ? (pagination.page - 1) * pagination.limit + 1 : 0}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} logs
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!pagination.hasPrevPage}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700">
                  Page {pagination.page}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!pagination.hasNextPage}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminSystemLogs;
