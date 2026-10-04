import React, { useRef, useState } from 'react';
import axios from 'axios';
import { FaCamera } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import ProfileAvatar from './ProfileAvatar';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const ProfilePhotoControl = ({ user, className = '', showLabel = false }) => {
  const { updateUser } = useAuth();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setMessage('Choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMessage('Profile photo must be 10 MB or smaller.');
      return;
    }

    setUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('profilePhoto', file);
      const response = await axios.put(
        `${process.env.REACT_APP_API_URL}/api/auth/profile/photo`,
        formData
      );
      if (!response.data?.user) {
        throw new Error('The server did not return the updated profile.');
      }
      updateUser(response.data.user);
      setMessage(response.data.message || 'Profile photo updated.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to update profile photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`profile-photo-control ${className}`.trim()}>
      <label
        className="profile-photo-control-trigger"
        aria-label="Choose profile photo"
        title="Choose profile photo"
      >
        <ProfileAvatar user={user} className="profile-photo-control-avatar" />
        <span className="profile-photo-control-camera" aria-hidden="true">
          {uploading ? '' : <FaCamera />}
        </span>
        {showLabel && <span className="profile-photo-control-label">Change photo</span>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={uploadPhoto}
          disabled={uploading}
          aria-label="Upload profile photo"
        />
      </label>
      {message && (
        <span
          className={`profile-photo-control-message${message.includes('updated') ? ' success' : ''}`}
          role="status"
        >
          {message}
        </span>
      )}
    </div>
  );
};

export default ProfilePhotoControl;
