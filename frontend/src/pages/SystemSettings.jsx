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

const settingsTabs = [
  { id: 'general', label: 'General' },
  { id: 'appearance-notifications', label: 'Appearance & Notifications' },
  { id: 'properties', label: 'Properties' },
  { id: 'maintenance', label: 'Maintenance' },
];

const ToggleSwitch = ({ id, label, checked, onChange, description }) => (
  <div className="flex items-center justify-between gap-6">
    <div>
      <span id={`${id}-label`} className="font-medium text-slate-800">{label}</span>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
    <label htmlFor={id} className="inline-flex shrink-0 cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-labelledby={`${id}-label`}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-blue-700 peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-700"
      />
    </label>
  </div>
);

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
  const [activeTab, setActiveTab] = useState(settingsTabs[0].id);

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

  const handleTabKeyDown = (event) => {
    const currentIndex = settingsTabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % settingsTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + settingsTabs.length) % settingsTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = settingsTabs.length - 1;
    else return;

    event.preventDefault();
    setActiveTab(settingsTabs[nextIndex].id);
    event.currentTarget.querySelectorAll('[role="tab"]')[nextIndex].focus();
  };

  const handleSettingsSubmit = (event) => {
    const missingRequiredSetting = !settings.general.websiteName
      ? { tab: 'general', field: 'website-name' }
      : !settings.maintenance.message
        ? { tab: 'maintenance', field: 'maintenance-message' }
        : null;

    if (missingRequiredSetting) {
      event.preventDefault();
      setActiveTab(missingRequiredSetting.tab);
      setTimeout(() => document.getElementById(missingRequiredSetting.field)?.reportValidity(), 0);
      return;
    }

    saveSettings(event);
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
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
        <form onSubmit={handleSettingsSubmit} className="rounded-xl bg-white p-6 shadow">
          <div
            role="tablist"
            aria-label="System settings sections"
            onKeyDown={handleTabKeyDown}
            className="-mx-6 -mt-6 mb-6 flex overflow-x-auto border-b border-slate-200 px-6"
          >
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="settings-panel"
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 border-b-2 px-4 py-4 text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-700 text-blue-800'
                    : 'border-transparent text-slate-600 hover:text-blue-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeTab}`}
            tabIndex={0}
            className="min-h-64"
          >
            {activeTab === 'general' && (
              <section aria-label="General settings" className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
                      className="mt-3 max-h-24 max-w-48 rounded border border-slate-200 bg-white p-2 object-contain"
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
                <div className="md:col-span-2">
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
            )}

            {activeTab === 'appearance-notifications' && (
              <section aria-label="Appearance and notification settings" className="space-y-8">
                <div className="max-w-xl">
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
                <fieldset className="max-w-2xl space-y-5">
                  <legend className="mb-4 text-lg font-bold text-slate-900">Notification defaults</legend>
                  <ToggleSwitch
                    id="in-app-notifications"
                    label="Enable in-app notifications"
                    checked={settings.notifications.inAppEnabled}
                    onChange={(event) => updateNotification('inAppEnabled', event.target.checked)}
                  />
                  <ToggleSwitch
                    id="email-notifications"
                    label="Enable email notifications"
                    checked={settings.notifications.emailEnabled}
                    onChange={(event) => updateNotification('emailEnabled', event.target.checked)}
                  />
                </fieldset>
              </section>
            )}

            {activeTab === 'properties' && (
              <section aria-label="Property settings" className="max-w-3xl space-y-6">
                <h2 className="text-xl font-bold text-slate-900">Property settings</h2>
                <ToggleSwitch
                  id="property-submissions"
                  label="Allow new property submissions"
                  checked={settings.properties.submissionsEnabled}
                  onChange={(event) => updateSection('properties', 'submissionsEnabled', event.target.checked)}
                />
                <ToggleSwitch
                  id="property-admin-review"
                  label="Require admin review before properties are publicly visible"
                  checked={settings.properties.requireAdminReview}
                  onChange={(event) => updateSection('properties', 'requireAdminReview', event.target.checked)}
                />
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Changing this setting does not change the status of existing pending or rejected properties.</p>
              </section>
            )}

            {activeTab === 'maintenance' && (
              <section aria-label="Maintenance settings" className="rounded-xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
                <div className="mb-6">
                  <p className="text-sm font-bold uppercase tracking-wide text-amber-800">Platform availability</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Maintenance mode</h2>
                  <p className="mt-2 text-sm text-amber-900">Use this setting when the platform needs to be temporarily unavailable to other users.</p>
                </div>
                <div className="space-y-6">
                  <ToggleSwitch
                    id="maintenance-mode"
                    label="Enable maintenance mode"
                    description="Visitors will see the maintenance message while this mode is enabled."
                    checked={settings.maintenance.enabled}
                    onChange={(event) => updateSection('maintenance', 'enabled', event.target.checked)}
                  />
                  <div>
                    <label htmlFor="maintenance-message" className="mb-2 block font-semibold text-slate-800">Maintenance message</label>
                    <textarea
                      id="maintenance-message"
                      required
                      maxLength={500}
                      rows={3}
                      value={settings.maintenance.message}
                      onChange={(event) => updateSection('maintenance', 'message', event.target.value)}
                      className="w-full rounded-lg border border-amber-300 bg-white p-3"
                    />
                  </div>
                  <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">Platform Admins can continue working and turn maintenance mode off.</p>
                </div>
              </section>
            )}
          </div>

          <div className="-mx-6 -mb-6 sticky bottom-0 z-10 mt-8 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
              </div>
              <button
                type="submit"
                disabled={saving || logoUploading}
                className="shrink-0 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
};

export default SystemSettings;
