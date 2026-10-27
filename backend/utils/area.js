const { normalizeAreaName, buildCanonicalAreaQuery } = require('./canonicalArea');

const buildAssignedAreaQuery = (area) => {
  const query = buildCanonicalAreaQuery(area);
  return query.$or?.length ? query : { _id: null };
};

module.exports = { normalizeAreaName, buildAssignedAreaQuery };
