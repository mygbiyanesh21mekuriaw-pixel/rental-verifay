const canonicalAreaKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, '');

const normalizeAreaName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const buildCanonicalAreaPattern = (value) => {
  const key = canonicalAreaKey(value);
  if (!key) return null;
  const separator = '[^\\p{L}\\p{N}]*';
  const pattern = Array.from(key)
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(separator);
  return new RegExp(`^${separator}${pattern}${separator}$`, 'iu');
};

const buildCanonicalAreaQuery = (value, { keyField = 'areaKey', valueField = 'area' } = {}) => {
  const key = canonicalAreaKey(value);
  if (!key) return { _id: null };
  const conditions = [{ [keyField]: key }];
  const legacyPattern = buildCanonicalAreaPattern(value);
  if (legacyPattern) conditions.push({ [valueField]: legacyPattern });
  return { $or: conditions };
};

module.exports = {
  canonicalAreaKey,
  normalizeAreaName,
  buildCanonicalAreaPattern,
  buildCanonicalAreaQuery,
};
