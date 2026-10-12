const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');

const isPlatformAdmin = (user) => user?.role === 'admin' && (
  user.adminType === 'platform' ||
  (!user.adminType && (!user.adminAreas || user.adminAreas.length === 0))
);

const getPlatformAdminFromRequest = async (req) => {
  const authorization = req.header('Authorization');
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;
  if (!match) return null;

  try {
    const decoded = jwt.verify(match[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id role adminType adminAreas').lean();
    return isPlatformAdmin(user) ? user : null;
  } catch (error) {
    return null;
  }
};

const maintenanceMode = async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (/^\/api\/auth\/(login|forgot-password|reset-password)$/.test(req.path)) return next();
  if (req.path === '/api/chapa/transfer-approval') return next();
  if (req.path === '/api/admin/system-settings' || req.path === '/api/admin/system-settings/logo') return next();

  try {
    const settings = await SystemSettings.findOne({ key: 'global' }).select('maintenance').lean();
    if (!settings?.maintenance?.enabled) return next();

    const platformAdmin = await getPlatformAdminFromRequest(req);
    if (platformAdmin) return next();

    return res.status(503).json({
      maintenanceMode: true,
      message: settings.maintenance.message ||
        'RentalVerify is temporarily unavailable for scheduled maintenance. Please check back soon.',
    });
  } catch (error) {
    console.error('Unable to enforce maintenance mode:', error);
    return res.status(503).json({ message: 'Unable to verify application availability.' });
  }
};

const propertySubmissionsEnabled = async (req, res, next) => {
  try {
    const settings = await SystemSettings.findOne({ key: 'global' }).select('properties.submissionsEnabled').lean();
    if (settings?.properties?.submissionsEnabled === false) {
      return res.status(403).json({ message: 'New property submissions are currently disabled.' });
    }
    return next();
  } catch (error) {
    console.error('Unable to verify property submission settings:', error);
    return res.status(503).json({ message: 'Unable to verify whether property submissions are enabled.' });
  }
};

module.exports = { maintenanceMode, propertySubmissionsEnabled, isPlatformAdmin };
