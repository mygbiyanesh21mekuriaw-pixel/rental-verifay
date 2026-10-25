const UNKNOWN_HANDLER_NAME = 'Unknown (before history tracking)';

const appendAdminDecision = (item, admin, decision, note = '', at = new Date()) => {
  const entry = {
    action: decision,
    byId: admin._id,
    byName: String(admin.name || '').trim() || UNKNOWN_HANDLER_NAME,
    at,
    note: String(note || '').trim(),
  };

  item.handledBy = admin._id;
  item.handledByName = entry.byName;
  item.handledByRole = 'area_admin';
  item.handledAt = at;
  item.decision = decision;
  if (!Array.isArray(item.history)) item.history = [];
  item.history.push(entry);
  return entry;
};

module.exports = { UNKNOWN_HANDLER_NAME, appendAdminDecision };
