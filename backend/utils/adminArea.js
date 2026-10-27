const adminAreaFields = ['city', 'region', 'zone', 'wereda', 'subCity'];
const { canonicalAreaKey, normalizeAreaName, buildCanonicalAreaQuery } = require('./canonicalArea');

const normalizeAreaValue = (value) => {
  return normalizeAreaName(value);
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

  const propertyKey = canonicalAreaKey(property?.area || property?.areaKey);
  if (!propertyKey) return false;
  return areas.some((area) => {
    if (typeof area === 'string') {
      return propertyKey === canonicalAreaKey(area);
    }
    const field = getCanonicalAreaField(area);
    if (!field) return false;
    return propertyKey === canonicalAreaKey(area[field]);
  });
};

const buildAdminAreaQuery = (areas) => ({
  $or: areas.flatMap((area) => {
    let value;
    if (typeof area === 'string') {
      value = area;
    } else {
      const field = getCanonicalAreaField(area);
      if (!field) return [];
      value = area[field];
    }
    const query = buildCanonicalAreaQuery(value);
    return query.$or || [];
  }),
});

module.exports = {
  normalizeAdminAreaObject,
  propertyMatchesAdminAreas,
  buildAdminAreaQuery,
};