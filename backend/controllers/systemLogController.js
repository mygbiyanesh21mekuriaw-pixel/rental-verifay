const mongoose = require('mongoose');
const SystemLog = require('../models/SystemLog');
const User = require('../models/User');
const { permissionRoleForUser } = require('../config/permissionCatalog');

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

const createSystemLog = async ({
  user = null,
  role = null,
  action,
  description,
  property = null,
  rentalRequest = null,
  payment = null,
  status = 'success',
  ipAddress = '',
}) => {
  if (!action || !description) {
    return null;
  }

  try {
    const log = await SystemLog.create({
      user,
      role,
      action,
      description,
      property,
      rentalRequest,
      payment,
      status,
      ipAddress,
      ip: ipAddress,
    });
    return log;
  } catch (error) {
    console.error('Failed to create system log:', error.message);
    return null;
  }
};

const normalizeDateRange = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getSortObject = (sortValue) => {
  const nextValue = (sortValue || '').toString().trim();
  if (!nextValue) return { createdAt: -1 };
  if (nextValue === 'oldest' || nextValue === 'createdAt-asc' || nextValue === 'createdAt') return { createdAt: 1 };
  if (nextValue === 'newest' || nextValue === 'createdAt-desc' || nextValue === '-createdAt') return { createdAt: -1 };
  if (nextValue === 'role') return { role: 1, createdAt: -1 };
  if (nextValue === 'status') return { status: 1, createdAt: -1 };
  return { createdAt: -1 };
};

const buildLogQuery = async (params = {}) => {
  const query = {};
  const clauses = [];
  const searchTerm = String(params.q || params.search || '').trim();

  if (searchTerm) {
    query.$or = [
      { action: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { targetLabel: { $regex: searchTerm, $options: 'i' } },
      { actorName: { $regex: searchTerm, $options: 'i' } },
      { actorEmail: { $regex: searchTerm, $options: 'i' } },
    ];
    clauses.push({ $or: query.$or });
    delete query.$or;
  }

  const userId = params.user || params.userId;
  if (userId && mongoose.isValidObjectId(String(userId))) query.user = userId;

  const requestedRole = String(params.role || '').trim();
  if (requestedRole && requestedRole !== 'All' && requestedRole !== 'all') {
    if (requestedRole === 'area_admin' || requestedRole === 'platform_admin') {
      const legacyAdminFilter = requestedRole === 'area_admin'
        ? { role: 'admin', $or: [{ adminType: 'area' }, { adminAreas: { $exists: true, $ne: [] } }] }
        : { role: 'admin', $or: [{ adminType: 'platform' }, { adminType: { $exists: false } }, { adminAreas: { $size: 0 } }] };
      const legacyAdmins = await User.find(legacyAdminFilter).select('_id').lean();
      clauses.push({
        $or: [
          { role: requestedRole },
          { role: 'admin', user: { $in: legacyAdmins.map(({ _id }) => _id) } },
        ],
      });
    } else {
      query.role = requestedRole;
    }
  }

  const requestedAction = String(params.action || '').trim();
  if (requestedAction && requestedAction !== 'All' && requestedAction !== 'all') query.action = requestedAction;

  const requestedStatus = String(params.status || '').trim();
  if (requestedStatus && requestedStatus !== 'All' && requestedStatus !== 'all') query.status = requestedStatus;

  const requestedModule = String(params.module || '').trim();
  if (requestedModule && requestedModule !== 'All' && requestedModule !== 'all') query.module = requestedModule;

  const fromDate = normalizeDateRange(params.from || params.dateFrom);
  const toDate = normalizeDateRange(params.to || params.dateTo);
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = fromDate;
    if (toDate) {
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endOfDay;
    }
  }

  if (params.important === 'true' || params.important === true) {
    clauses.push({ action: { $in: [...IMPORTANT_ACTIONS] } });
  }

  if (params.failedOnly === 'true' || params.failedOnly === true) {
    query.status = 'failed';
  }

  if (clauses.length) {
    query.$and = clauses;
  }

  return query;
};

const populatedLogs = (query) => SystemLog.find(query)
  .populate('user', 'name email role adminType adminAreas')
  .populate('property', 'title')
  .populate('rentalRequest', 'status')
  .populate('payment', 'paymentReference status');

const serializeLog = (log) => ({
  ...log,
  role: log.role === 'admin' && log.user ? permissionRoleForUser(log.user) : log.role,
  actorName: log.actorName || log.user?.name || '',
  actorEmail: log.actorEmail || log.user?.email || '',
});

const getSystemLogTotals = async (query) => {
  const [total, success, failed, adminChanges] = await Promise.all([
    SystemLog.countDocuments(query),
    SystemLog.countDocuments({ ...query, status: 'success' }),
    SystemLog.countDocuments({ ...query, status: 'failed' }),
    SystemLog.countDocuments({ ...query, action: { $in: [...IMPORTANT_ACTIONS] } }),
  ]);

  return { total, success, failed, adminChanges };
};

const getSystemLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const skip = (page - 1) * limit;
    const query = await buildLogQuery(req.query);
    const sort = getSortObject(req.query.sort);

    const [logs, total, totals] = await Promise.all([
      populatedLogs(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .then((records) => records.map(serializeLog)),
      SystemLog.countDocuments(query),
      getSystemLogTotals(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      logs,
      totals,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({ message: 'Failed to load system logs' });
  }
};

const getUserActivityTimeline = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  try {
    const logs = await populatedLogs({ user: req.params.userId })
      .sort({ createdAt: 1 })
      .limit(1000)
      .lean();
    return res.json({ logs: logs.map(serializeLog) });
  } catch (error) {
    console.error('Error fetching user activity timeline:', error);
    return res.status(500).json({ message: 'Failed to load user activity.' });
  }
};

const csvCell = (value) => {
  const text = String(value ?? '');
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const exportSystemLogsCsv = async (req, res) => {
  try {
    const query = await buildLogQuery(req.query);
    const logs = await populatedLogs(query)
      .sort(getSortObject(req.query.sort))
      .limit(10000)
      .lean();
    const columns = ['Date & Time', 'User', 'Email', 'Role', 'Action', 'Module', 'Target', 'Description', 'Status'];
    const rows = logs.map((log) => [
      log.createdAt?.toISOString?.() || '',
      log.actorName || log.user?.name || 'System',
      log.actorEmail || log.user?.email || '',
      log.role === 'admin' && log.user ? permissionRoleForUser(log.user) : log.role || 'Unknown',
      log.action,
      log.module || '',
      log.targetLabel || log.property?.title || '',
      log.description,
      log.status,
    ]);
    const csv = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('Error exporting system logs:', error);
    return res.status(500).json({ message: 'Failed to export audit log.' });
  }
};

module.exports = {
  createSystemLog,
  getSystemLogs,
  getUserActivityTimeline,
  exportSystemLogsCsv,
};
