const adminAreaFields = ['city', 'region', 'zone', 'wereda', 'subCity'];

const areaAliases = {
  'a.a': 'Addis Ababa',
  'aa': 'Addis Ababa',
  'addis ababa': 'Addis Ababa',
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeAreaValue = (value) => {
  const trimmed = String(value || '').trim();
  return areaAliases[trimmed.toLowerCase()] || trimmed;
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

  if (normalized.region.toLowerCase() === 'addis ababa') {
    return { city: 'Addis Ababa' };
  }

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
    const field = getCanonicalAreaField(area);
    if (!field) return false;
    return String(property?.[field] || '').trim().toLowerCase()
      === String(area[field]).trim().toLowerCase();
  });
};

const buildAdminAreaQuery = (areas) => ({
  $or: areas
    .map((area) => {
      const field = getCanonicalAreaField(area);
      if (!field) return null;
      return { [field]: new RegExp(`^${escapeRegex(area[field])}$`, 'i') };
    })
    .filter(Boolean),
});

module.exports = {
  normalizeAdminAreaObject,
  propertyMatchesAdminAreas,
  buildAdminAreaQuery,
};