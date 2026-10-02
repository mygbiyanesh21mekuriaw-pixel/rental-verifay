import React from 'react';
import { resolveAssetUrl } from '../utils/assetUrl';

const ProfileAvatar = ({ user, className = '' }) => {
  const name = user?.name || 'User';
  const initial = name.charAt(0).toUpperCase() || 'U';
  const photoUrl = resolveAssetUrl(user?.profilePhoto);

  return (
    <span
      className={`profile-avatar ${className}`.trim()}
      role="img"
      aria-label={`${name} profile`}
    >
      <span aria-hidden="true">{initial}</span>
      {photoUrl && (
        <img
          src={photoUrl}
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
};

export default ProfileAvatar;
