const { PERMISSION_CATALOG, permissionRoleForUser } = require('../config/permissionCatalog');
const { logAudit } = require('../utils/auditLogger');

const requirePermission = (permissionKey) => (req, res, next) => {
  if (!req.user) return next();
  const role = permissionRoleForUser(req.user);
  if (role === 'platform_admin') return next();
  if (!PERMISSION_CATALOG[role] || req.user?.permissions?.[permissionKey] !== true) {
    void logAudit({
      req,
      action: 'PERMISSION_DENIED',
      module: 'permissions',
      status: 'denied',
      details: { requiredPermission: permissionKey, route: `${req.baseUrl || ''}${req.path || ''}` },
      description: `${req.user?.name || 'User'} was denied access to ${permissionKey}.`,
    });
    return res.status(403).json({ message: 'Permission denied' });
  }
  next();
};

module.exports = requirePermission;