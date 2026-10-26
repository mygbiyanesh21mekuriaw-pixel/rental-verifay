const adminAreaFields = ['city', 'region', 'zone', 'wereda', 'subCity'];

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeAreaValue = (value) => {
  return String(value || '').trim();
};

const normalizeAdminAreaObject = (area) => {
  if (typeof area === 'string') {
    const value = normalizeAreaValue(area);
    return value ? { city: value } : null;
  }

  if (!area || typeof area !== 'object') return null;

  const normalized = Object.fromEntries(
    adminAreaFields.map((field) => [field, normalizeAreaValue(area[field])])
  );

  const field = adminAreaFields.find((candidate) => normalized[candidate]);
  return field ? { [field]: normalized[field] } : null;
};

const getCanonicalAreaField = (area) => {
  if (!area || typeof area !== 'object') return null;
  return adminAreaFields.find((field) => String(area[field] || '').trim()) || null;
};

const propertyMatchesAdminAreas = (property, areas) => {
  if (!Array.isArray(areas) || areas.length === 0) return true;

  return areas.some((area) => {
    if (typeof area === 'string') {
      return String(property?.area || '').trim().toLowerCase() === normalizeAreaValue(area).toLowerCase();
    }
    const field = getCanonicalAreaField(area);
    if (!field) return false;
    const expectedArea = String(area[field]).trim().toLowerCase();
    return String(property?.area || '').trim().toLowerCase() === expectedArea;
  });
};

const buildAdminAreaQuery = (areas) => ({
  $or: areas
    .map((area) => {
      if (typeof area === 'string') {
        const value = normalizeAreaValue(area);
        return value ? { area: new RegExp(`^${escapeRegex(value)}$`, 'i') } : null;
      }
      const field = getCanonicalAreaField(area);
      if (!field) return null;
      const exactMatch = new RegExp(`^${escapeRegex(area[field])}$`, 'i');
      return { area: exactMatch };
    })
    .filter(Boolean),
});

module.exports = {
  normalizeAdminAreaObject,
  propertyMatchesAdminAreas,
  buildAdminAreaQuery,
};