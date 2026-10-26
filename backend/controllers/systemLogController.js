const mongoose = require('mongoose');
const SystemLog = require('../models/SystemLog');
const User = require('../models/User');
const { permissionRoleForUser } = require('../config/permissionCatalog');

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

const buildLogQuery = async (params) => {
  const query = {};
  const clauses = [];
  if (params.search) {
    const searchTerm = String(params.search).trim();
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
  }
  if (params.user && mongoose.isValidObjectId(String(params.user))) query.user = params.user;
  if (params.role === 'area_admin' || params.role === 'platform_admin') {
    const legacyAdminFilter = params.role === 'area_admin'
      ? { role: 'admin', $or: [{ adminType: 'area' }, { adminAreas: { $exists: true, $ne: [] } }] }
      : { role: 'admin', $or: [{ adminType: 'platform' }, { adminType: { $exists: false } }, { adminAreas: { $size: 0 } }] };
    const legacyAdmins = await User.find(legacyAdminFilter).select('_id').lean();
    clauses.push({
      $or: [
        { role: params.role },
        { role: 'admin', user: { $in: legacyAdmins.map(({ _id }) => _id) } },
      ],
    });
  } else if (params.role) {
    query.role = params.role;
  }
  if (params.action) query.action = params.action;
  if (params.status) query.status = params.status;
  if (params.module) query.module = params.module;
  if (params.dateFrom || params.dateTo) {
    query.createdAt = {};
    if (params.dateFrom) query.createdAt.$gte = new Date(params.dateFrom);
    if (params.dateTo) {
      const endOfDay = new Date(params.dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endOfDay;
    }
  }
  if (clauses.length) query.$and = clauses;
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

const getSystemLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = await buildLogQuery(req.query);

    const [logs, total] = await Promise.all([
      populatedLogs(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .then((records) => records.map(serializeLog)),
      SystemLog.countDocuments(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      logs,
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
    const logs = await populatedLogs(await buildLogQuery(req.query))
      .sort({ createdAt: -1 })
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
