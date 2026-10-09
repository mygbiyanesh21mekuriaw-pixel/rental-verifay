import React, { useEffect, useState } from 'react';

const PropertyOwnershipProof = ({
  propertyId,
  hasProof = false,
  title,
  className,
  style,
  imageClassName,
  imageStyle,
  fallbackClassName,
  showLabel = true,
}) => {
  const [asset, setAsset] = useState(null);
  const [contentType, setContentType] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!propertyId || !hasProof) {
      setAsset(null);
      setContentType('');
      setError(false);
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl;
    const loadProof = async () => {
      setAsset(null);
      setContentType('');
      setError(false);
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.REACT_APP_API_URL || '';
        const response = await fetch(
          `${apiUrl}/api/properties/${encodeURIComponent(propertyId)}/ownership-proof`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error('Unable to access proof of ownership');

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setContentType(response.headers.get('content-type') || blob.type);
        setAsset(objectUrl);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(true);
      }
    };

    loadProof();
    return () => {
      controller.abort();
      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [propertyId, hasProof]);

  if (!hasProof) return null;
  const label = `Proof of ownership for ${title || 'property'}`;

  return (
    <div className={className} style={style}>
      {showLabel && <strong>Proof of Ownership</strong>}
      {!asset && !error && <span role="status">Loading proof of ownership...</span>}
      {error && (
        <span className={fallbackClassName} role="status">
          Proof of ownership is unavailable or requires secure migration.
        </span>
      )}
      {asset && contentType.toLowerCase().includes('pdf') ? (
        <a href={asset} target="_blank" rel="noreferrer">
          Open proof of ownership (PDF)
        </a>
      ) : asset ? (
        <img
          src={asset}
          alt={label}
          className={imageClassName}
          style={imageStyle}
        />
      ) : null}
    </div>
  );
};

export default PropertyOwnershipProof;
