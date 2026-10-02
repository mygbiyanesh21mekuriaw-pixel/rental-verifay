const getApiOrigin = () => {
  const apiUrl = process.env.REACT_APP_API_URL;
  if (!apiUrl) return '';

  try {
    return new URL(apiUrl, window.location.origin).origin;
  } catch (error) {
    console.error('Invalid REACT_APP_API_URL while resolving uploaded media:', error);
    return '';
  }
};

export const resolveAssetUrl = (asset) => {
  const assetValue = typeof asset === 'string'
    ? asset
    : asset?.secure_url || asset?.url || asset?.path || '';
  const value = String(assetValue).trim();
  if (!value || /^(data|blob):/i.test(value)) return value;

  const normalizedValue = value.replace(/\\/g, '/');
  const apiOrigin = getApiOrigin();

  if (/^https?:\/\//i.test(normalizedValue)) {
    try {
      const assetUrl = new URL(normalizedValue);
      const apiUrl = apiOrigin ? new URL(apiOrigin) : null;
      if (
        apiUrl &&
        (
          ['localhost', '127.0.0.1', '0.0.0.0'].includes(assetUrl.hostname) ||
          assetUrl.hostname === apiUrl.hostname
        )
      ) {
        assetUrl.protocol = apiUrl.protocol;
        assetUrl.host = apiUrl.host;
      }
      return assetUrl.href;
    } catch (error) {
      console.error('Invalid uploaded media URL:', error);
      return '';
    }
  }

  const normalizedPath = normalizedValue.replace(/^\/+/, '');
  const assetPath = normalizedPath.startsWith('uploads/')
    ? `/${normalizedPath}`
    : `/uploads/${normalizedPath}`;
  return `${apiOrigin}${assetPath}`;
};

export const isPdfAsset = (asset) => {
  const resolvedUrl = resolveAssetUrl(asset);
  try {
    return new URL(resolvedUrl, window.location.origin).pathname.toLowerCase().endsWith('.pdf');
  } catch (error) {
    console.error('Invalid uploaded document URL:', error);
    return false;
  }
};
