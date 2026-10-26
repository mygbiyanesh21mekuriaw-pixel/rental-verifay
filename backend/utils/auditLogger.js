const SystemLog = require('../models/SystemLog');
const User = require('../models/User');
const { permissionRoleForUser } = require('../config/permissionCatalog');

const withTimeout = (promise, milliseconds, operation) => {
  let timeoutId;
  const timeoutResult = Symbol(operation);
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(timeoutResult), milliseconds);
    }),
  ]).then((result) => {
    if (result === timeoutResult) throw new Error(`${operation} timed out.`);
    return result;
  }).finally(() => clearTimeout(timeoutId));
};

const maskSensitive = (value, key = '') => {
  if (/password|token|secret|authorization/i.test(key)) return '[REDACTED]';
  if (/bank.*(account|number)|account.*(number|no)/i.test(key)) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? `****${digits.slice(-4)}` : '';
  }
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      maskSensitive(childValue, childKey),
    ]));
  }
  return value;
};

const logAudit = async ({
  req,
  actor,
  action,
  module,
  targetType,
  targetId,
  targetLabel,
  details = {},
  status = 'success',
  description,
}) => {
  try {
    if (!action) throw new Error('An audit action is required.');
    let resolvedActor = actor || req?.user || null;
    const actorId = resolvedActor?.id || resolvedActor?._id || null;
    if (actorId && resolvedActor !== req?.user && (!resolvedActor.name || !resolvedActor.email || !resolvedActor.role)) {
      try {
        const actorQuery = User.findById(actorId);
        const actorLookup = typeof actorQuery?.select === 'function'
          ? actorQuery.select('name email role adminType adminAreas').lean()
          : actorQuery;
        const actorRecord = await withTimeout(Promise.resolve(actorLookup), 500, 'Audit actor lookup');
        if (actorRecord) resolvedActor = { ...actorRecord, ...resolvedActor };
      } catch (error) {
        console.error('Failed to resolve audit actor:', error.message);
      }
    }
    const role = resolvedActor ? permissionRoleForUser(resolvedActor) : null;
    const name = resolvedActor?.name || 'Unknown user';
    const email = resolvedActor?.email || '';
    const label = targetLabel || '';
    const humanDescription = description || [
      `${name}${email ? ` (${email})` : ''}`,
      action.replace(/_/g, ' ').toLowerCase(),
      label ? `"${label}"` : '',
    ].filter(Boolean).join(' ');
    const createPromise = SystemLog.create({
      user: actorId,
      actorName: name,
      actorEmail: email,
      role,
      action,
      description: humanDescription,
      status,
      module: module || 'system',
      targetType: targetType || '',
      targetId: targetId || null,
      targetLabel: label,
      details: maskSensitive(details),
      ip: req?.ip || req?.socket?.remoteAddress || '',
      ipAddress: req?.ip || req?.socket?.remoteAddress || '',
      userAgent: req?.get?.('user-agent') || '',
      sessionId: req?.user?.sessionId || req?.auditSessionId || '',
    });
    return await withTimeout(Promise.resolve(createPromise), 750, 'Audit log persistence');
  } catch (error) {
    console.error('Failed to create audit log:', error.message);
    return null;
  }
};

module.exports = { logAudit, maskSensitive };
