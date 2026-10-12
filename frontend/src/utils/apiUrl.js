export const apiUrl = (path) => {
  const configuredBase = String(process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
  const apiBase = configuredBase.replace(/\/api$/i, '');
  const endpoint = `/${String(path || '').replace(/^\/+/, '')}`;

  return `${apiBase}${endpoint}`;
};
