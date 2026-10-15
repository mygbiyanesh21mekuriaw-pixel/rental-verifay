import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ProfilePhotoControl from '../components/ProfilePhotoControl';

const LandlordProfile = () => {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(user);
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(!user);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    axios.get(`${process.env.REACT_APP_API_URL}/api/auth/me`)
      .then((response) => {
        if (!active) return;
        const account = response.data?.user || response.data;
        setProfile(account);
        setForm({ name: account.name || '', phone: account.phone || '' });
      })
      .catch((error) => {
        if (active) setMessage(error.response?.data?.message || 'Unable to load your profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_API_URL}/api/auth/profile`,
        form
      );
      if (!response.data?.user) throw new Error('The server did not return the updated profile.');
      setProfile(response.data.user);
      setForm({ name: response.data.user.name || '', phone: response.data.user.phone || '' });
      updateUser(response.data.user);
      setEditing(false);
      setMessage(response.data.message || 'Profile updated successfully.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className="landlord-account-page !m-0 !w-full !max-w-none !p-0"><p>Loading profile...</p></section>;
  }

  return (
    <section className="landlord-account-page !m-0 !w-full !max-w-none !p-0 flex flex-col gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">LANDLORD</p>
          <h1 className="m-0 text-2xl font-bold text-slate-800">Profile</h1>
          <span className="text-sm text-slate-600">Manage your name, phone number, and profile photo.</span>
        </div>
        {!editing && (
          <button type="button" className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]" onClick={() =>setEditing(true)}>Edit Profile
          </button>
        )}
      </header>

      <div className="landlord-account-card landlord-profile-card !mb-0">
        <ProfilePhotoControl user={user || profile} showLabel />
        {editing ? (
          <form className="landlord-account-form" onSubmit={saveProfile}>
            <label>Name
              <input
                value={form.name}
                onChange={(event) =>setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label>Phone
              <input
                type="tel"
                value={form.phone}
                onChange={(event) =>setForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <div className="landlord-account-actions">
              <button type="button" className="landlord-account-button secondary" onClick={() => {
                setForm({ name: profile?.name || '', phone: profile?.phone || '' });
                setEditing(false);
                setMessage('');
              }}>Cancel
              </button>
              <button type="submit" className="landlord-account-button !border-[var(--rv-dashboard-topbar)] !bg-[var(--rv-dashboard-topbar)] hover:!bg-[var(--rv-dashboard-navy)]" disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="landlord-account-details">
            <div><dt>Name</dt><dd>{profile?.name || 'Not set'}</dd></div>
            <div><dt>Phone</dt><dd>{profile?.phone || 'Not set'}</dd></div>
          </dl>
        )}
        {message && <p className="landlord-account-message" role="status">{message}</p>}
      </div>
    </section>
  );
};

export default LandlordProfile;
