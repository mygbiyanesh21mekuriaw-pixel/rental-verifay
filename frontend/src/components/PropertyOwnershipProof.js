import React from 'react';
import PropertyImage from './PropertyImage';
import { isPdfAsset, resolveAssetUrl } from '../utils/assetUrl';

const PropertyOwnershipProof = ({
  src,
  title,
  className,
  style,
  imageClassName,
  imageStyle,
  fallbackClassName,
  showLabel = true,
}) => {
  if (!src) return null;

  const label = `Proof of ownership for ${title || 'property'}`;
  const documentUrl = resolveAssetUrl(src);

  return (
    <div className={className} style={style}>
      {showLabel && <strong>Proof of Ownership</strong>}
      {isPdfAsset(src) ? (
        <a href={documentUrl} target="_blank" rel="noreferrer">
          Open proof of ownership (PDF)
        </a>
      ) : (
        <PropertyImage
          src={src}
          alt={label}
          className={imageClassName}
          style={imageStyle}
          fallbackClassName={fallbackClassName}
          fallbackText="Proof of ownership unavailable"
        />
      )}
    </div>
  );
};

export default PropertyOwnershipProof;
