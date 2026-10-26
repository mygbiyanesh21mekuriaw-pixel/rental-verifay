const { permissionRoleForUser } = require('../config/permissionCatalog');
const { getDefaultUserPermissions } = require('../services/userPermissions');

const getMyPermissions = (req, res) => {
  const effectiveRole = permissionRoleForUser(req.user) || req.user?.role;
  const permissionMap = req.user?.permissions && Object.keys(req.user.permissions).length > 0
    ? req.user.permissions
    : getDefaultUserPermissions(effectiveRole);

  const permissions = Object.entries(permissionMap)
    .filter(([, enabled]) => enabled === true)
    .map(([permissionKey]) => permissionKey);

  return res.json({ permissions });
};

module.exports = { getMyPermissions };