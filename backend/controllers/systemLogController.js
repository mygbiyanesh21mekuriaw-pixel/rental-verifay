const mongoose = require('mongoose');
const SystemLog = require('../models/SystemLog');

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
    });
    return log;
  } catch (error) {
    console.error('Failed to create system log:', error.message);
    return null;
  }
};

const getSystemLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.search) {
      const searchTerm = String(req.query.search).trim();
      if (searchTerm) {
        query.$or = [
          { action: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
        ];
      }
    }

    if (req.query.user && mongoose.isValidObjectId(String(req.query.user))) {
      query.user = req.query.user;
    }

    if (req.query.role) {
      query.role = req.query.role;
    }

    if (req.query.action) {
      query.action = req.query.action;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      query.createdAt = {};
      if (req.query.dateFrom) {
        query.createdAt.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        const endOfDay = new Date(req.query.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endOfDay;
      }
    }

    const [logs, total] = await Promise.all([
      SystemLog.find(query)
        .populate('user', 'name email role')
        .populate('property', 'title')
        .populate('rentalRequest', 'status')
        .populate('payment', 'paymentReference status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
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

module.exports = {
  createSystemLog,
  getSystemLogs,
};
