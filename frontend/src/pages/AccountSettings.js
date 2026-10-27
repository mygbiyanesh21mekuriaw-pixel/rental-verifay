import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import BackToDashboard from '../components/BackToDashboard';
import ProfilePhotoControl from '../components/ProfilePhotoControl';
import './accountSettings.css';

const EMPTY_PROFILE_FORM = { name: '', email: '', phone: '', currentPassword: '' };
const EMPTY_PASSWORD_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };
const LANGUAGES = [
  ['en', 'English'],
  ['am', 'አማርኛ'],
  ['om', 'Afaan Oromoo'],
  ['ti', 'ትግርኛ'],
  ['sid', 'Sidama'],
];

const getRoleName = (profile, t) => {
  if (profile?.role === 'admin') {
    return profile.adminType === 'area' ? t('Area Admin') : t('Platform Admin');
  }
  if (profile?.role === 'area_admin') return t('Area Admin');
  if (profile?.role === 'platform_admin') return t('Platform Admin');
  return t(profile?.role === 'landlord' ? 'Landlord' : 'Tenant');
};

const formatDate = (value, language, withTime = false) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(
    { en: 'en-ET', am: 'am-ET', om: 'om-ET', ti: 'ti-ET', sid: 'sid-ET' }[language],
    withTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' }
  ).format(date);
};

const getDeviceLabel = (userAgent = '', t) => {
  const browser = /Edg\//i.test(userAgent)
    ? t('Edge')
    : /Firefox\//i.test(userAgent)
      ? t('Firefox')
      : /Chrome\//i.test(userAgent)
        ? t('Chrome')
        : /Safari\//i.test(userAgent)
          ? t('Safari')
          : '';
  const device = /Android|iPhone|iPad|Mobile/i.test(userAgent)
    ? t('Mobile device')
    : t('Desktop device');
  return browser ? `${browser} · ${device}` : device;
};

const AccountSettings = () => {
  const { user, updateUser, loadUser } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [profile, setProfile] = useState(user || null);
  const [security, setSecurity] = useState({ lastLoginAt: null, lastPasswordChangeAt: null, recentSignIns: [] });
  const [systemPreferences, setSystemPreferences] = useState(user?.systemPreferences || {});
  const [activeTab, setActiveTab] = useState('Profile');
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState('');
  const profileEditTrigger = useRef(null);
  const passwordEditTrigger = useRef(null);
  const modalWasOpen = useRef(false);

  useEffect(() => {
    let active = true;
    axios.get(`${process.env.REACT_APP_API_URL}/api/auth/me`)
      .then((response) => {
        if (!active) return;
        const account = response.data?.user || response.data;
        setProfile(account);
        setSecurity(response.data?.security || {
          lastLoginAt: response.data?.lastLoginAt || null,
          lastPasswordChangeAt: response.data?.lastPasswordChangeAt || null,
          recentSignIns: response.data?.recentSignIns || [],
        });
        setSystemPreferences(response.data?.systemPreferences || {});
        setProfileForm({
          name: account.name || '',
          email: account.email || '',
          phone: account.phone || '',
          currentPassword: '',
        });
      })
      .catch((error) => {
        if (active) setLoadError(error.response?.data?.message || t('Unable to load your profile.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    const modalOpen = editingProfile || editingPassword;
    if (modalOpen) {
      document.querySelector('.account-settings-modal input')?.focus();
    } else if (modalWasOpen.current) {
      (profileEditTrigger.current || passwordEditTrigger.current)?.focus();
    }
    modalWasOpen.current = modalOpen;
  }, [editingProfile, editingPassword]);

  useEffect(() => {
    if (!editingProfile && !editingPassword) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (editingProfile && !savingProfile) {
          setEditingProfile(false);
          setMessage('');
        }
        if (editingPassword && !savingPassword) {
          setEditingPassword(false);
          setPasswordForm(EMPTY_PASSWORD_FORM);
          setMessage('');
        }
        return;
      }
      if (event.key === 'Tab') {
        const dialog = document.querySelector('.account-settings-modal');
        const focusable = [...(dialog?.querySelectorAll('input:not([disabled]), button:not([disabled]), select:not([disabled])') || [])];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingProfile, editingPassword, savingProfile, savingPassword]);

  const handleProfileUpdated = (updatedProfile) => {
    setProfile((current) => ({ ...current, ...updatedProfile }));
    updateUser({ ...user, ...updatedProfile });
  };

  const handlePhotoUpdated = (updatedProfile) => {
    setProfile((current) => ({ ...current, ...updatedProfile }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setMessage('');
    if (profileForm.phone && !/^(?:09\d{8}|\+2519\d{8})$/.test(profileForm.phone.trim())) {
      setMessage(t('Use 09XXXXXXXX or +2519XXXXXXXX.'));
      return;
    }
    if (profileForm.email.trim().toLowerCase() !== String(profile?.email || '').toLowerCase() &&
        !profileForm.currentPassword) {
      setMessage(t('Enter your current password to change your email.'));
      return;
    }

    setSavingProfile(true);
    try {
      const { currentPassword, ...changes } = profileForm;
      const response = await axios.put(`${process.env.REACT_APP_API_URL}/api/auth/profile`, {
        ...changes,
        ...(changes.email.trim().toLowerCase() !== String(profile?.email || '').toLowerCase()
          ? { currentPassword }
          : {}),
      });
      const updatedProfile = response.data?.user;
      if (!updatedProfile) throw new Error(t('The server did not return the updated profile.'));
      handleProfileUpdated(updatedProfile);
      setProfileForm({
        name: updatedProfile.name || '',
        email: updatedProfile.email || '',
        phone: updatedProfile.phone || '',
        currentPassword: '',
      });
      await loadUser();
      setEditingProfile(false);
      setMessage(response.data?.message || t('Profile updated successfully'));
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || t('Unable to update your profile.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setMessage('');
    if (passwordForm.newPassword.length < 8) {
      setMessage(t('New password must be at least 8 characters.'));
      return;
    }
    if (passwordForm.newPassword === passwordForm.currentPassword) {
      setMessage(t('New password must be different from the current password.'));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage(t('New password and confirmation do not match.'));
      return;
    }

    setSavingPassword(true);
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/api/auth/change-password`, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm(EMPTY_PASSWORD_FORM);
      setEditingPassword(false);
      setSecurity((current) => ({ ...current, lastPasswordChangeAt: new Date().toISOString() }));
      setMessage(t('Password changed successfully.'));
    } catch (error) {
      setMessage(error.response?.data?.message || t('Unable to change your password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const cancelProfileEdit = () => {
    setProfileForm({
      name: profile?.name || '',
      email: profile?.email || '',
      phone: profile?.phone || '',
      currentPassword: '',
    });
    setEditingProfile(false);
    setMessage('');
  };

  const roleName = getRoleName(profile || user, t);
  const isAreaAdmin = profile?.role === 'area_admin' ||
    (profile?.role === 'admin' && profile.adminType === 'area');
  const areaName = profile?.area ||
    profile?.assignedArea ||
    profile?.adminAreas?.[0]?.name ||
    profile?.adminAreas?.[0]?.city ||
    '';
  const dashboardRoute = profile?.role === 'admin'
    ? '/admin-dashboard'
    : profile?.role === 'tenant'
      ? '/tenant-dashboard'
      : '/landlord-dashboard';
  const notifications = systemPreferences?.notifications || {};

  if (loading) {
    return <main className="account-settings-page"><p role="status">{t('Loading profile...')}</p></main>;
  }
  if (loadError || !profile) {
    return (
      <main className="account-settings-page">
        <p className="account-settings-error" role="alert">{loadError || t('Profile is unavailable.')}</p>
        <button type="button" className="account-settings-button" onClick={() => window.location.reload()}>
          {t('Try again')}
        </button>
      </main>
    );
  }

  return (
    <main className="account-settings-page">
      {profile.role !== 'landlord' && (
        <BackToDashboard dashboardRoute={dashboardRoute} label={t('← Back to Dashboard')} />
      )}
      <h1 className="account-settings-title">{t('Account Settings')}</h1>

      <section className="account-settings-hero" aria-label={t('Profile header')}>
        <ProfilePhotoControl
          user={profile}
          className="account-settings-photo"
          showLabel
          onUserUpdated={handlePhotoUpdated}
        />
        <div className="account-settings-hero-copy">
          <h2>{profile.name || t('Name not set')}</h2>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          <span className="account-settings-role">{roleName}</span>
        </div>
        <button
          type="button"
          className="account-settings-button account-settings-primary"
          ref={profileEditTrigger}
          onClick={() => {
            profileEditTrigger.current = document.activeElement;
            setProfileForm({
              name: profile.name || '',
              email: profile.email || '',
              phone: profile.phone || '',
              currentPassword: '',
            });
            setMessage('');
            setEditingProfile(true);
          }}
        >
          {t('Edit Profile')}
        </button>
      </section>

      <nav className="account-settings-tabs" aria-label={t('Account settings tabs')} role="tablist">
        {['Profile', 'Security', 'Preferences'].map((tab) => (
          <button
            key={tab}
            id={`account-tab-${tab.toLowerCase()}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="account-settings-panel"
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => { setActiveTab(tab); setMessage(''); }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const tabs = ['Profile', 'Security', 'Preferences'];
              const currentIndex = tabs.indexOf(tab);
              const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
              const nextTab = tabs[nextIndex];
              setActiveTab(nextTab);
              document.getElementById(`account-tab-${nextTab.toLowerCase()}`)?.focus();
            }}
          >
            {t(tab)}
          </button>
        ))}
      </nav>

      <div id="account-settings-panel" className="account-settings-panel" role="tabpanel" tabIndex={0} aria-labelledby={`account-tab-${activeTab.toLowerCase()}`}>
        {activeTab === 'Profile' && (
          <div className="account-settings-grid">
            <section className="account-settings-card">
              <h2>{t('Profile information')}</h2>
              <dl className="account-settings-details">
                <div><dt>{t('Name')}</dt><dd>{profile.name || t('Not set')}</dd></div>
                <div><dt>{t('Email')}</dt><dd><a href={`mailto:${profile.email}`}>{profile.email}</a></dd></div>
                <div>
                  <dt>{t('Phone')}</dt>
                  <dd>{profile.phone || (
                    <button type="button" className="account-settings-text-button" onClick={() => {
                      profileEditTrigger.current = document.activeElement;
                      setProfileForm({
                        name: profile.name || '',
                        email: profile.email || '',
                        phone: '',
                        currentPassword: '',
                      });
                      setEditingProfile(true);
                    }}>{t('+ Add phone')}</button>
                  )}</dd>
                </div>
                {isAreaAdmin && <div><dt>{t('Area')}</dt><dd>{areaName || t('Not set')}</dd></div>}
              </dl>
            </section>
            <section className="account-settings-card account-settings-note">
              <h2>{t('Your account')}</h2>
              <p>{t('Your role and area are managed by an administrator and cannot be changed here.')}</p>
              <p>{t('Email changes require your current password.')}</p>
            </section>
          </div>
        )}

        {activeTab === 'Security' && (
          <div className="account-settings-grid">
            <section className="account-settings-card">
              <div className="account-settings-card-heading">
                <div>
                  <h2>{t('Password')}</h2>
                  <p>{t('Keep your account secure with a strong password.')}</p>
                </div>
                <button type="button" className="account-settings-button account-settings-secondary" ref={passwordEditTrigger} onClick={() => {
                  passwordEditTrigger.current = document.activeElement;
                  setPasswordForm(EMPTY_PASSWORD_FORM);
                  setShowPasswords(false);
                  setMessage('');
                  setEditingPassword(true);
                }}>{t('Change Password')}</button>
              </div>
              <dl className="account-settings-details account-settings-security-dates">
                <div><dt>{t('Last password change')}</dt><dd>{security.lastPasswordChangeAt ? formatDate(security.lastPasswordChangeAt, language, true) : t('No record available')}</dd></div>
                <div><dt>{t('Last login')}</dt><dd>{security.lastLoginAt ? formatDate(security.lastLoginAt, language, true) : t('No record available')}</dd></div>
              </dl>
            </section>
            <section className="account-settings-card">
              <h2>{t('Recent sign-ins')}</h2>
              {security.recentSignIns?.length ? (
                <ul className="account-settings-signins">
                  {security.recentSignIns.slice(0, 5).map((signIn, index) => (
                    <li key={`${signIn.at || signIn.createdAt}-${index}`}>
                      <span>{getDeviceLabel(signIn.userAgent, t)}</span>
                      <time dateTime={signIn.at || signIn.createdAt}>
                        {formatDate(signIn.at || signIn.createdAt, language, true)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : <p>{t('No recent sign-ins recorded.')}</p>}
            </section>
          </div>
        )}

        {activeTab === 'Preferences' && (
          <div className="account-settings-grid">
            <section className="account-settings-card">
              <h2>{t('Language')}</h2>
              <label className="account-settings-field" htmlFor="account-language">{t('Display language')}
                <select id="account-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </section>
            <section className="account-settings-card">
              <h2>{t('Notification defaults')}</h2>
              <p>{t('These notification settings are managed by the platform.')}</p>
              <label className="account-settings-toggle">
                <input type="checkbox" checked={notifications.inAppEnabled !== false} disabled readOnly />
                <span>{t('Enable in-app notifications')}</span>
              </label>
              <label className="account-settings-toggle">
                <input type="checkbox" checked={notifications.emailEnabled !== false} disabled readOnly />
                <span>{t('Enable email notifications')}</span>
              </label>
            </section>
          </div>
        )}
      </div>

      {message && <p className="account-settings-message" role="status">{message}</p>}

      {editingProfile && (
        <div className="account-settings-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingProfile) cancelProfileEdit();
        }}>
          <section className="account-settings-modal" role="dialog" aria-modal="true" aria-labelledby="account-profile-modal-title">
            <h2 id="account-profile-modal-title">{t('Edit Profile')}</h2>
            <form className="account-settings-form" onSubmit={saveProfile}>
              <label>{t('Name')}<input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>{t('Email')}<input type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} required /></label>
              <label>{t('Phone')}
                <input type="tel" inputMode="tel" pattern="(09[0-9]{8}|\+2519[0-9]{8})?" title={t('Use 09XXXXXXXX or +2519XXXXXXXX.')} value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} />
                <small>{t('Use 09XXXXXXXX or +2519XXXXXXXX.')}</small>
              </label>
              {profileForm.email.trim().toLowerCase() !== String(profile.email || '').toLowerCase() && (
                <label>{t('Current password')}<input type="password" autoComplete="current-password" value={profileForm.currentPassword} onChange={(event) => setProfileForm((current) => ({ ...current, currentPassword: event.target.value }))} required /></label>
              )}
              {message && <p className="account-settings-error" role="alert">{message}</p>}
              <div className="account-settings-modal-actions">
                <button type="button" className="account-settings-button account-settings-secondary" onClick={cancelProfileEdit} disabled={savingProfile}>{t('Cancel')}</button>
                <button type="submit" className="account-settings-button account-settings-primary" disabled={savingProfile}>{savingProfile ? t('Saving...') : t('Save Profile')}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editingPassword && (
        <div className="account-settings-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingPassword) setEditingPassword(false);
        }}>
          <section className="account-settings-modal" role="dialog" aria-modal="true" aria-labelledby="account-password-modal-title">
            <h2 id="account-password-modal-title">{t('Change Password')}</h2>
            <form className="account-settings-form" onSubmit={changePassword}>
              {[
                ['currentPassword', 'Current password', 'current-password'],
                ['newPassword', 'New password', 'new-password'],
                ['confirmPassword', 'Confirm new password', 'new-password'],
              ].map(([field, label, autocomplete]) => (
                <label key={field}>{t(label)}
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete={autocomplete}
                    minLength={field === 'currentPassword' ? undefined : 8}
                    value={passwordForm[field]}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, [field]: event.target.value }))}
                    required
                  />
                </label>
              ))}
              <label className="account-settings-show-password">
                <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
                {t('Show passwords')}
              </label>
              {message && <p className="account-settings-error" role="alert">{message}</p>}
              <div className="account-settings-modal-actions">
                <button type="button" className="account-settings-button account-settings-secondary" onClick={() => {
                  setEditingPassword(false);
                  setPasswordForm(EMPTY_PASSWORD_FORM);
                  setMessage('');
                }} disabled={savingPassword}>{t('Cancel')}</button>
                <button type="submit" className="account-settings-button account-settings-primary" disabled={savingPassword}>{savingPassword ? t('Saving...') : t('Update Password')}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default AccountSettings;
