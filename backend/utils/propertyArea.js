const UNASSIGNED_AREA = 'Unassigned area';
const ADDRESS_MAPPING_FIELDS = ['region', 'zone', 'wereda', 'city'];

const normalize = (value) => String(value || '').trim().toLowerCase();

const matchAreaFromAddress = (address, areas) => {
  const candidates = (areas || []).map((area) => {
    const mapping = area.addressMapping || {};
    const fields = ADDRESS_MAPPING_FIELDS.filter((field) => normalize(mapping[field]));
    if (fields.length === 0) return null;
    const matches = fields.every((field) => normalize(mapping[field]) === normalize(address[field]));
    return matches ? { name: area.name, specificity: fields.length } : null;
  }).filter(Boolean);

  if (candidates.length === 0) return null;
  const greatestSpecificity = Math.max(...candidates.map((candidate) => candidate.specificity));
  const mostSpecific = candidates.filter((candidate) => candidate.specificity === greatestSpecificity);
  const names = new Set(mostSpecific.map((candidate) => normalize(candidate.name)));
  return names.size === 1 ? mostSpecific[0].name : null;
};

module.exports = { ADDRESS_MAPPING_FIELDS, UNASSIGNED_AREA, matchAreaFromAddress };