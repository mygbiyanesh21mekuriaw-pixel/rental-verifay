import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/apiUrl';
import { useSystemStatus } from '../context/SystemStatusContext';

const initialSettings = {
  defaultAppearance: 'system',
  notifications: {
    inAppEnabled: true,
    emailEnabled: true,
  },
  general: {
    websiteName: 'House Rental Management System',
    websiteLogoDataUri: '',
    contactEmail: '',
    contactPhone: '',
    contactAddress: '',
  },
  properties: {
    submissionsEnabled: true,
    requireAdminReview: true,
  },
  maintenance: {
    enabled: false,
    message: 'RentalVerify is temporarily unavailable for scheduled maintenance. Please check back soon.',
  },
};

const requestErrorMessage = (error, action) => {
  const responseMessage = error.response?.data?.message;
  if (responseMessage) return responseMessage;

  if (error.response?.status === 401) {
    return 'Your session has expired. Sign in again to manage system settings.';
  }
  if (error.response?.status === 403) {
    return 'Platform Admin access is required to manage system settings.';
  }
  if (error.response?.status === 404) {
    return 'System Settings API endpoint was not found. Confirm the backend is updated and running.';
  }
  if (!error.response) {
    return `Could not reach the server to ${action} system settings. Check the API URL and backend connection.`;
  }
  return `The server could not ${action} system settings (HTTP ${error.response.status}).`;
};

const SystemSettings = () => {
  const { loadUser } = useAuth();
  const { refreshStatus } = useSystemStatus();
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get(
          apiUrl('/api/admin/system-settings'),
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
        if (!response.data?.settings) {
          throw new Error('The server returned an invalid system settings response.');
        }
        setSettings(response.data.settings);
      } catch (loadError) {
        console.error('Unable to load system settings:', loadError);
        setError(requestErrorMessage(loadError, 'load'));
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const updateNotification = (key, value) => {
    setSettings((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: value },
    }));
  };

  const updateSection = (section, key, value) => {
    setSettings((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  };

  const uploadLogo = async (event) => {
    const logoFile = event.target.files?.[0];
    if (!logoFile) return;
    setLogoUploading(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);
      const response = await axios.post(
        apiUrl('/api/admin/system-settings/logo'),
        formData,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setSettings(response.data.settings);
      await refreshStatus();
      setMessage('Website logo updated successfully.');
    } catch (uploadError) {
      console.error('Unable to upload website logo:', uploadError);
      setError(requestErrorMessage(uploadError, 'save'));
    } finally {
      setLogoUploading(false);
      event.target.value = '';
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await axios.put(
        apiUrl('/api/admin/system-settings'),
        settings,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setSettings(response.data.settings);
      await refreshStatus();
      await loadUser();
      setMessage('System settings saved successfully.');
    } catch (saveError) {
      console.error('Unable to save system settings:', saveError);
      setError(requestErrorMessage(saveError, 'save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/admin-dashboard" className="mb-5 inline-flex font-semibold text-blue-700 hover:text-blue-900">
        Back to Dashboard
      </Link>
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Platform Admin</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">System Settings</h1>
        <p className="mt-2 text-slate-600">Manage website branding, appearance, notifications, property submissions, and maintenance.</p>
      </header>

      {loading ? (
        <p role="status" className="rounded-lg bg-white p-6 text-slate-600 shadow">Loading system settings…</p>
      ) : (
        <form onSubmit={saveSettings} className="space-y-8 rounded-xl bg-white p-6 shadow">
          <section aria-labelledby="general-settings-heading" className="space-y-5">
            <h2 id="general-settings-heading" className="text-xl font-bold text-slate-900">General Settings</h2>
            <div>
              <label htmlFor="website-name" className="mb-2 block font-semibold text-slate-800">Website name</label>
              <input
                id="website-name"
                required
                maxLength={100}
                value={settings.general.websiteName}
                onChange={(event) => updateSection('general', 'websiteName', event.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>
            <div>
              <label htmlFor="website-logo" className="mb-2 block font-semibold text-slate-800">Website logo (PNG, JPG, or WEBP; up to 1 MB)</label>
              <input
                id="website-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoUploading}
                onChange={uploadLogo}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
              {logoUploading && <p role="status" className="mt-2 text-sm text-slate-600">Uploading logo…</p>}
              {settings.general.websiteLogoDataUri && (
                <img
                  src={settings.general.websiteLogoDataUri}
                  alt="Current website logo preview"
                  className="mt-3 max-h-24 max-w-48 object-contain"
                />
              )}
            </div>
            <div>
              <label htmlFor="website-contact-email" className="mb-2 block font-semibold text-slate-800">Contact email</label>
              <input
                id="website-contact-email"
                type="email"
                maxLength={254}
                value={settings.general.contactEmail}
                onChange={(event) => updateSection('general', 'contactEmail', event.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>
            <div>
              <label htmlFor="website-contact-phone" className="mb-2 block font-semibold text-slate-800">Contact phone</label>
              <input
                id="website-contact-phone"
                type="tel"
                maxLength={30}
                value={settings.general.contactPhone}
                onChange={(event) => updateSection('general', 'contactPhone', event.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>
            <div>
              <label htmlFor="website-contact-address" className="mb-2 block font-semibold text-slate-800">Contact address</label>
              <textarea
                id="website-contact-address"
                maxLength={500}
                rows={3}
                value={settings.general.contactAddress}
                onChange={(event) => updateSection('general', 'contactAddress', event.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>
          </section>

          <div>
            <label htmlFor="default-appearance" className="mb-2 block font-semibold text-slate-800">Default appearance</label>
            <select
              id="default-appearance"
              value={settings.defaultAppearance}
              onChange={(event) => setSettings((current) => ({ ...current, defaultAppearance: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 p-3"
            >
              <option value="system">Use system preference</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-2 font-semibold text-slate-800">Notification defaults</legend>
            <label className="flex items-center gap-3 text-slate-700">
              <input
                type="checkbox"
                checked={settings.notifications.inAppEnabled}
                onChange={(event) => updateNotification('inAppEnabled', event.target.checked)}
              />
              Enable in-app notifications
            </label>
            <label className="flex items-center gap-3 text-slate-700">
              <input
                type="checkbox"
                checked={settings.notifications.emailEnabled}
                onChange={(event) => updateNotification('emailEnabled', event.target.checked)}
              />
              Enable email notifications
            </label>
          </fieldset>

          <section aria-labelledby="property-settings-heading" className="space-y-4 border-t border-slate-200 pt-6">
            <h2 id="property-settings-heading" className="text-xl font-bold text-slate-900">Property Settings</h2>
            <label className="flex items-center gap-3 text-slate-700">
              <input
                type="checkbox"
                checked={settings.properties.submissionsEnabled}
                onChange={(event) => updateSection('properties', 'submissionsEnabled', event.target.checked)}
              />
              Allow new property submissions
            </label>
            <label className="flex items-center gap-3 text-slate-700">
              <input
                type="checkbox"
                checked={settings.properties.requireAdminReview}
                onChange={(event) => updateSection('properties', 'requireAdminReview', event.target.checked)}
              />
              Require admin review before properties are publicly visible
            </label>
            <p className="text-sm text-slate-500">Changing this setting does not change the status of existing pending or rejected properties.</p>
          </section>

          <section aria-labelledby="maintenance-settings-heading" className="space-y-4 border-t border-slate-200 pt-6">
            <h2 id="maintenance-settings-heading" className="text-xl font-bold text-slate-900">Maintenance Mode</h2>
            <label className="flex items-center gap-3 text-slate-700">
              <input
                type="checkbox"
                checked={settings.maintenance.enabled}
                onChange={(event) => updateSection('maintenance', 'enabled', event.target.checked)}
              />
              Enable maintenance mode
            </label>
            <div>
              <label htmlFor="maintenance-message" className="mb-2 block font-semibold text-slate-800">Maintenance message</label>
              <textarea
                id="maintenance-message"
                required
                maxLength={500}
                rows={3}
                value={settings.maintenance.message}
                onChange={(event) => updateSection('maintenance', 'message', event.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>
            <p className="text-sm text-slate-500">Platform Admins can continue working and turn maintenance mode off.</p>
          </section>

          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-700">{message}</p>}
          <button
            type="submit"
            disabled={saving || logoUploading}
            className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      )}
    </section>
  );
};

export default SystemSettings;
