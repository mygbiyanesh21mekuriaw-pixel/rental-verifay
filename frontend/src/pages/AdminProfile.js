import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import BackToDashboard from '../components/BackToDashboard';
import './adminDashboard.css';

const AdminProfile = () => {
  const { loadUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('token');
    axios.get('http://localhost:5000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((response) => {
      if (!active) return;
      const account = response.data?.user || response.data;
      setProfile(account);
      setProfileForm({
        name: account.name || '',
        email: account.email || '',
        phone: account.phone || '',
      });
    }).catch((error) => {
      if (active) setLoadError(error.response?.data?.message || 'Unable to load your profile.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put('http://localhost:5000/api/auth/profile', profileForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const updatedProfile = response.data?.user;
      if (updatedProfile) {
        setProfile(updatedProfile);
        setProfileForm({
          name: updatedProfile.name || '',
          email: updatedProfile.email || '',
          phone: updatedProfile.phone || '',
        });
      }
      await loadUser();
      setEditingProfile(false);
      setProfileMessage(response.data?.message || 'Profile updated successfully.');
    } catch (error) {
      setProfileMessage(error.response?.data?.message || 'Unable to update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage('');
    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put('http://localhost:5000/api/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setEditingPassword(false);
      setPasswordMessage(response.data?.message || 'Password changed successfully.');
    } catch (error) {
      setPasswordMessage(error.response?.data?.message || 'Unable to change your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="admin-profile-page">
        <BackToDashboard dashboardRoute="/admin-dashboard" />
        <h1 className="admin-profile-heading">👤 Profile</h1>
        <p className={loadError ? 'admin-profile-message error' : 'admin-profile-message'}>
          {loading ? 'Loading profile...' : loadError || 'Profile is unavailable.'}
        </p>
      </div>
    );
  }

  const roleName = profile.adminType === 'area' ? 'Area Admin' : 'Platform Admin';

  return (
    <div className="admin-profile-page">
      <BackToDashboard dashboardRoute="/admin-dashboard" />
      <header className="admin-profile-heading-row">
        <div>
          <p className="admin-profile-eyebrow">ACCOUNT SETTINGS</p>
          <h1 className="admin-profile-heading">👤 Profile</h1>
        </div>
        <span className="admin-profile-role">{roleName}</span>
      </header>

      <section className="admin-profile-section" aria-labelledby="admin-profile-details-title">
        <div className="admin-profile-section-header">
          <h2 id="admin-profile-details-title">Account information</h2>
          {!editingProfile && (
            <button type="button" className="admin-profile-edit-button" onClick={() => setEditingProfile(true)}>
              ✏️ Edit Profile
            </button>
          )}
        </div>

        {editingProfile ? (
          <form className="admin-profile-form" onSubmit={saveProfile}>
            <label>Name<input value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} required /></label>
            <label>Email<input type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} required /></label>
            <label>Phone<input type="tel" value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} /></label>
            {profileMessage && <p className="admin-profile-message" role="status">{profileMessage}</p>}
            <div className="admin-profile-actions">
              <button type="button" className="admin-profile-cancel-button" onClick={() => {
                setProfileForm({ name: profile.name || '', email: profile.email || '', phone: profile.phone || '' });
                setProfileMessage('');
                setEditingProfile(false);
              }}>Cancel</button>
              <button type="submit" className="admin-profile-submit-button" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="admin-profile-details">
            <div><dt>Name</dt><dd>{profile.name || 'Not set'}</dd></div>
            <div><dt>Role</dt><dd>Admin ({roleName})</dd></div>
            <div><dt>Email</dt><dd><a href={`mailto:${profile.email}`}>{profile.email}</a></dd></div>
            <div><dt>Phone</dt><dd>{profile.phone || 'Not set'}</dd></div>
          </dl>
        )}
        {!editingProfile && profileMessage && <p className="admin-profile-message" role="status">{profileMessage}</p>}
      </section>

      <section className="admin-profile-section" aria-labelledby="admin-profile-password-title">
        <div className="admin-profile-section-header">
          <h2 id="admin-profile-password-title">Security</h2>
          {!editingPassword && (
            <button type="button" className="admin-profile-edit-button" onClick={() => {
              setPasswordMessage('');
              setEditingPassword(true);
            }}>
              🔐 Change Password
            </button>
          )}
        </div>
        {editingPassword && (
          <form className="admin-profile-form" onSubmit={changePassword}>
            <label>Current password<input type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required /></label>
            <label>New password<input type="password" autoComplete="new-password" minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} required /></label>
            {passwordMessage && <p className="admin-profile-message" role="status">{passwordMessage}</p>}
            <div className="admin-profile-actions">
              <button type="button" className="admin-profile-cancel-button" onClick={() => {
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setPasswordMessage('');
                setEditingPassword(false);
              }}>Cancel</button>
              <button type="submit" className="admin-profile-submit-button" disabled={savingPassword}>
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
        {!editingPassword && passwordMessage && <p className="admin-profile-message" role="status">{passwordMessage}</p>}
      </section>
    </div>
  );
};

export default AdminProfile;
