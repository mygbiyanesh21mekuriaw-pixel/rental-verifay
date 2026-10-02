import React, { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../utils/assetUrl';

const PropertyImage = ({
  src,
  alt,
  className,
  style,
  fallbackClassName,
  fallbackStyle,
  fallbackText = 'No image available',
}) => {
  const imageUrls = (Array.isArray(src) ? src : [src])
    .map(resolveAssetUrl)
    .filter(Boolean);
  const imageSourceKey = imageUrls.join('|');
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [imageSourceKey]);

  if (imageIndex >= imageUrls.length) {
    return (
      <div
        className={fallbackClassName || className}
        style={fallbackStyle || style}
        role="img"
        aria-label={alt || fallbackText}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={imageUrls[imageIndex]}
      alt={alt || ''}
      className={className}
      style={style}
      onError={() => setImageIndex((index) => index + 1)}
    />
  );
};

export default PropertyImage;
