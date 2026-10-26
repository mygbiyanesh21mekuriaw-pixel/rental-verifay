const normalizeAreaName = (value) => String(value || '').trim();

const buildAssignedAreaQuery = (area) => {
  const normalizedArea = normalizeAreaName(area);
  if (!normalizedArea) return { _id: null };
  const escapedArea = normalizedArea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactMatch = new RegExp(`^${escapedArea}$`, 'i');
  return { area: exactMatch };
};

module.exports = { normalizeAreaName, buildAssignedAreaQuery };
