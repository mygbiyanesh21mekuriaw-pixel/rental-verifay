import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { FaChevronDown, FaChevronRight, FaLock, FaSearch, FaUser } from 'react-icons/fa';
import { useLanguage } from '../context/LanguageContext';
import { apiUrl } from '../utils/apiUrl';

const ALWAYS_ON = new Set(['dashboard', 'accountSettings', 'changePassword']);

const roleLabels = {
  platform_admin: 'Platform Admin',
  area_admin: 'Area Admin',
  landlord: 'Landlord',
  tenant: 'Tenant',
};

const permissionLabels = {
  dashboard: 'Dashboard',
  allProperties: 'Properties',
  pendingProperties: 'Under Review',
  verifiedProperties: 'Verified Properties',
  rejectedProperties: 'Rejected Properties',
  rentalRequests: 'Rental Requests',
  messages: 'Messages',
  contactMessages: 'Contact Messages',
  notifications: 'Notifications',
  accountSettings: 'Account Settings',
  changePassword: 'Change Password',
  addProperty: 'Add House',
  myProperties: 'My Properties',
  underReview: 'Under Review',
  rentedProperties: 'Rented Properties',
  rentPayments: 'Rent Payments',
  bankInformation: 'Bank Information',
  reviews: 'Tenant Reviews',
  favorites: 'Favorites',
  rentedProperty: 'Rented Property',
  searchProperties: 'Search Properties',
  recentlyViewed: 'Recently Viewed',
};

const PERMISSION_GROUPS = [
  { label: 'Properties', keys: ['addProperty', 'myProperties', 'allProperties', 'pendingProperties', 'verifiedProperties', 'underReview', 'rejectedProperties', 'rentedProperties', 'rentedProperty'] },
  { label: 'Rentals & Payments', keys: ['rentalRequests', 'rentPayments', 'bankInformation'] },
  { label: 'Communication', keys: ['messages', 'notifications', 'contactMessages', 'reviews'] },
  { label: 'Discovery', keys: ['favorites', 'searchProperties', 'recentlyViewed'] },
  { label: 'Account', keys: ['dashboard', 'accountSettings', 'changePassword'] },
];

const getUserRole = (user) => {
  if (user?.role !== 'admin') return user?.role;
  return user.adminType === 'area' || (!user.adminType && user.adminAreas?.length > 0)
    ? 'area_admin'
    : 'platform_admin';
};

const getUserStatus = (user) => user?.status || (user?.isActive === false ? 'suspended' : 'active');

const normalizePermissionMap = (permissions, catalog) => Object.fromEntries(
  (Array.isArray(catalog) ? catalog : []).map(({ permissionKey, enabled }) => {
    const hasPermissionValue = Object.prototype.hasOwnProperty.call(permissions || {}, permissionKey);
    return [
      permissionKey,
      ALWAYS_ON.has(permissionKey) || (hasPermissionValue ? permissions[permissionKey] === true : enabled === true),
    ];
  }),
);

const permissionGroupsForCatalog = (catalog) => {
  const keys = new Set((Array.isArray(catalog) ? catalog : []).map(({ permissionKey }) => permissionKey));
  const assigned = new Set();
  const groups = PERMISSION_GROUPS.map((group) => {
    const items = group.keys.filter((key) => keys.has(key));
    items.forEach((key) => assigned.add(key));
    return { label: group.label, items };
  }).filter((group) => group.items.length > 0);
  const remaining = [...keys].filter((key) => !assigned.has(key));
  return remaining.length ? [...groups, { label: 'Other', items: remaining }] : groups;
};

const initialsFor = (name) => String(name || '?')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0] || '')
  .join('')
  .toUpperCase();

const permissionSnapshot = (userId, role, status, assignedArea, permissions) => JSON.stringify({
  userId,
  role,
  status,
  assignedArea,
  permissions: Object.fromEntries(Object.entries(permissions || {}).sort(([left], [right]) => left.localeCompare(right))),
});

const UsersPermissionsPage = () => {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [areas, setAreas] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(searchParams.get('userId') || '');
  const [role, setRole] = useState('tenant');
  const [status, setStatus] = useState('active');
  const [assignedArea, setAssignedArea] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [baseline, setBaseline] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [pendingOpen, setPendingOpen] = useState(false);
  const [userListOpen, setUserListOpen] = useState(true);

  const getHeaders = () => {
    const token = localStorage.getItem('token');
    return { headers: token ? { Authorization: `Bearer ${token}` } : {} };
  };

  const allSelectableUsers = useMemo(() => {
    const byId = new Map();
    [...pendingUsers, ...users].forEach((user) => {
      if (user?._id) byId.set(String(user._id), user);
    });
    return [...byId.values()];
  }, [pendingUsers, users]);
  const selectedUser = useMemo(
    () => allSelectableUsers.find((user) => String(user._id) === selectedUserId),
    [allSelectableUsers, selectedUserId],
  );

  const loadUsers = useCallback(async (preferredUserId = searchParams.get('userId')) => {
    setLoadingUsers(true);
    try {
      const [allResponse, pendingResponse] = await Promise.all([
        axios.get(apiUrl('/api/admin/users'), getHeaders()),
        axios.get(apiUrl('/api/admin/users?status=pending'), getHeaders()),
      ]);
      const allUsers = Array.isArray(allResponse.data) ? allResponse.data : [];
      const pending = Array.isArray(pendingResponse.data) ? pendingResponse.data : [];
      setUsers(allUsers);
      setPendingUsers(pending);
      setPendingOpen(pending.length > 0);
      try {
        const areasResponse = await axios.get(apiUrl('/api/areas'), getHeaders());
        setAreas(Array.isArray(areasResponse.data) ? areasResponse.data : []);
      } catch (error) {
        setAreas([]);
      }

      const candidates = [...pending, ...allUsers];
      const nextUser = candidates.find((user) => String(user._id) === preferredUserId)
        || candidates[0];
      setSelectedUserId(nextUser ? String(nextUser._id) : '');
    } catch (error) {
      setFeedback({ type: 'error', text: error.response?.data?.message || 'Unable to load users.' });
    } finally {
      setLoadingUsers(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!selectedUser) return;
    setRole(getUserRole(selectedUser));
    setStatus(getUserStatus(selectedUser));
    setAssignedArea(selectedUser.assignedArea || selectedUser.area || '');
    setCatalog([]);
    setPermissions({});
    setBaseline(null);
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUserId || !role) return undefined;
    if (role === 'platform_admin') {
      setLoadingPermissions(false);
      return undefined;
    }
    let current = true;
    const loadPermissions = async () => {
      setLoadingPermissions(true);
      try {
        const response = await axios.get(
          apiUrl(`/api/admin/users/${selectedUserId}/permissions?role=${encodeURIComponent(role)}`),
          getHeaders(),
        );
        if (!current) return;
        const nextCatalog = Array.isArray(response.data?.catalog) ? response.data.catalog : [];
        const nextPermissions = normalizePermissionMap(response.data?.permissions || {}, nextCatalog);
        const nextStatus = response.data?.status || getUserStatus(selectedUser);
        setCatalog(nextCatalog);
        setPermissions(nextPermissions);
        setBaseline((currentBaseline) => currentBaseline || permissionSnapshot(
          selectedUserId,
          role,
          nextStatus,
          selectedUser.assignedArea || selectedUser.area || '',
          nextPermissions,
        ));
      } catch (error) {
        if (current) setFeedback({ type: 'error', text: error.response?.data?.message || 'Unable to load permissions.' });
      } finally {
        if (current) setLoadingPermissions(false);
      }
    };
    loadPermissions();
    return () => { current = false; };
  }, [selectedUserId, role, selectedUser]);

  const isPlatformAdmin = getUserRole(selectedUser) === 'platform_admin';
  const isDirty = Boolean(selectedUser && baseline && baseline !== permissionSnapshot(
    selectedUserId,
    role,
    status,
    assignedArea,
    permissions,
  ));

  const selectUser = (nextUserId) => {
    if (nextUserId === selectedUserId) return;
    if (isDirty && !window.confirm(t('You have unsaved changes. Discard them and switch users?'))) return;
    setFeedback(null);
    setSelectedUserId(nextUserId);
    setUserListOpen(false);
  };

  const updatePermissionGroup = (keys, enabled) => {
    setPermissions((current) => {
      const next = { ...current };
      keys.forEach((key) => {
        if (!ALWAYS_ON.has(key)) next[key] = enabled;
      });
      return next;
    });
  };

  const resetChanges = () => {
    if (!baseline) return;
    const saved = JSON.parse(baseline);
    setRole(saved.role);
    setStatus(saved.status);
    setAssignedArea(saved.assignedArea);
    setPermissions(saved.permissions);
  };

  const savePermissions = async (approve = false) => {
    if (!selectedUser || isPlatformAdmin) return;
    setSaving(true);
    setFeedback(null);
    try {
      const savedStatus = approve ? 'pending' : status;
      await axios.put(apiUrl(`/api/admin/users/${selectedUserId}/permissions`), {
        role,
        status: savedStatus,
        permissions,
        ...(role === 'area_admin' ? { area: assignedArea } : {}),
      }, getHeaders());
      if (approve) {
        await axios.post(apiUrl(`/api/admin/users/${selectedUserId}/approve`), {}, getHeaders());
      }
      const finalStatus = approve ? 'active' : savedStatus;
      setStatus(finalStatus);
      setBaseline(permissionSnapshot(selectedUserId, role, finalStatus, assignedArea, permissions));
      setFeedback({ type: 'success', text: approve ? 'User approved and permissions saved.' : 'Role and permissions saved.' });
      await loadUsers(selectedUserId);
    } catch (error) {
      setFeedback({ type: 'error', text: error.response?.data?.message || 'Unable to save user permissions.' });
    } finally {
      setSaving(false);
    }
  };

  const roleFiltered = (user) => roleFilter === 'all' || getUserRole(user) === roleFilter;
  const searchFiltered = (user) => `${user.name || ''} ${user.email || ''}`
    .toLowerCase()
    .includes(search.trim().toLowerCase());
  const visiblePendingUsers = pendingUsers.filter(roleFiltered).filter(searchFiltered);
  const pendingIds = new Set(pendingUsers.map((user) => String(user._id)));
  const visibleUsers = allSelectableUsers
    .filter((user) => !pendingIds.has(String(user._id)))
    .filter(roleFiltered)
    .filter(searchFiltered);
  const groups = permissionGroupsForCatalog(catalog);

  const renderUserRow = (user) => {
    const userId = String(user._id);
    const selected = selectedUserId === userId;
    const currentRole = getUserRole(user);
    return (
      <button
        key={userId}
        type="button"
        onClick={() => selectUser(userId)}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${selected ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-700' : ''}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--rv-dashboard-topbar)] text-sm font-bold text-white">
          {initialsFor(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{user.name || t('Unknown')}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">{user.email}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
          {t(roleLabels[currentRole] || currentRole)}
        </span>
      </button>
    );
  };

  return (
    <section className="w-full space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">{t('Access control')}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{t('Roles & Permissions')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('Review pending accounts and configure user access.')}</p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900">
          {pendingUsers.length} {t('pending')}
        </span>
      </header>

      <div className="grid min-w-0 gap-4 pb-24 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section aria-label={t('Users')} className="min-w-0 self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:sticky lg:top-4">
          <button
            type="button"
            className="flex min-h-10 w-full items-center justify-between text-left font-semibold text-slate-900 lg:cursor-default"
            onClick={() => setUserListOpen((open) => !open)}
            aria-expanded={userListOpen}
          >
            <span>{t('Users')}</span>
            <span className="text-xs font-medium text-slate-500 lg:hidden">{userListOpen ? t('Hide') : t('Show')}</span>
          </button>

          <div className={`${userListOpen ? 'block' : 'hidden'} mt-3 space-y-3 lg:block`}>
            <label className="relative block">
              <FaSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search users')}
                aria-label={t('Search users')}
                className="min-h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <div role="tablist" aria-label={t('Filter users by role')} className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
              {[
                ['all', 'All'],
                ['area_admin', 'Area Admin'],
                ['landlord', 'Landlord'],
                ['tenant', 'Tenant'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={roleFilter === value}
                  onClick={() => setRoleFilter(value)}
                  className={`min-h-8 flex-1 rounded-lg px-2 text-xs font-semibold transition ${roleFilter === value ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>

            <div className="max-h-[320px] space-y-3 overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-24rem)]">
              {pendingUsers.length > 0 && (
                <section className="overflow-hidden rounded-xl border border-amber-200">
                  <button
                    type="button"
                    onClick={() => setPendingOpen((open) => !open)}
                    aria-expanded={pendingOpen}
                    className="flex min-h-11 w-full items-center gap-2 bg-amber-50 px-3 text-left text-sm font-semibold text-amber-950"
                  >
                    {pendingOpen ? <FaChevronDown aria-hidden="true" /> : <FaChevronRight aria-hidden="true" />}
                    <span className="flex-1">{t('Pending')}</span>
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs">{pendingUsers.length}</span>
                  </button>
                  {pendingOpen && (
                    <div className="space-y-1 p-1">
                      {visiblePendingUsers.length
                        ? visiblePendingUsers.map(renderUserRow)
                        : <p className="px-3 py-4 text-sm text-slate-500">{t('No users match your search.')}</p>}
                    </div>
                  )}
                </section>
              )}

              <div className="space-y-1">
              {loadingUsers ? (
                <p role="status" className="px-3 py-5 text-sm text-slate-600">{t('Loading users...')}</p>
              ) : visibleUsers.length ? (
                visibleUsers.map(renderUserRow)
              ) : (
                <p className="px-3 py-5 text-sm text-slate-600">{t('No users found.')}</p>
              )}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="selected-user-heading" className="min-w-0 space-y-4">
          {!selectedUser ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-600">
              <FaUser aria-hidden="true" className="mx-auto mb-3 text-2xl text-slate-400" />
              {loadingUsers ? t('Loading users...') : t('Select a user to manage roles and permissions.')}
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--rv-dashboard-topbar)] text-lg font-bold text-white">
                  {initialsFor(selectedUser.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="selected-user-heading" className="truncate text-lg font-bold text-slate-900">{selectedUser.name || t('Unknown')}</h2>
                  <p className="truncate text-sm text-slate-600">{selectedUser.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">{t(roleLabels[getUserRole(selectedUser)] || getUserRole(selectedUser))}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'active' ? 'bg-emerald-50 text-emerald-800' : status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800'}`}>
                      {t(status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : 'Suspended')}
                    </span>
                  </div>
                </div>
                <Link
                  to={`/admin-dashboard/system-logs?userId=${encodeURIComponent(selectedUserId)}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-700 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  {t('View activity')}
                </Link>
                {isDirty && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{t('Unsaved changes')}</span>}
              </header>

              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5">
                <label className="block text-sm font-semibold text-slate-800">
                  {t('Role')}
                  {isPlatformAdmin ? (
                    <p className="mt-2 flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 font-normal">{t('Platform Admin')}</p>
                  ) : (
                    <select aria-label={t('Role')} className="mt-2 block min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" value={role} onChange={(event) => setRole(event.target.value)} disabled={saving}>
                      {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
                    </select>
                  )}
                </label>
                <label className="block text-sm font-semibold text-slate-800">
                  {t('Status')}
                  <select aria-label={t('Status')} className="mt-2 block min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving || isPlatformAdmin}>
                    <option value="pending">{t('Pending')}</option>
                    <option value="active">{t('Active')}</option>
                    <option value="suspended">{t('Suspended')}</option>
                  </select>
                </label>
                {role === 'area_admin' && getUserRole(selectedUser) !== 'area_admin' && (
                  <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                    {t('Assigned area')}
                    <select aria-label={t('Assigned area')} className="mt-2 block min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" value={assignedArea} onChange={(event) => setAssignedArea(event.target.value)} disabled={saving}>
                      <option value="">{t('Select an assigned area')}</option>
                      {areas.map((area) => <option key={area._id || area.name} value={area.name}>{area.name}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {isPlatformAdmin ? (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">{t('Platform Admin access is always full and cannot be edited.')}</p>
              ) : loadingPermissions ? (
                <div role="status" className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">{t('Loading permissions...')}</div>
              ) : (
                <div className="space-y-4">
                  {groups.map(({ label, items }) => {
                    const editableKeys = items.filter((key) => !ALWAYS_ON.has(key));
                    const allEnabled = editableKeys.length > 0 && editableKeys.every((key) => permissions[key] === true);
                    return (
                      <section key={label} aria-labelledby={`permission-group-${label}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
                          <h3 id={`permission-group-${label}`} className="font-bold text-slate-900">{t(label)}</h3>
                          {editableKeys.length > 0 && (
                            <div className="flex items-center gap-3">
                              <button type="button" className="text-xs font-semibold text-emerald-800 hover:underline disabled:text-slate-400" onClick={() => updatePermissionGroup(editableKeys, true)} disabled={saving || allEnabled}>{t('Select all')}</button>
                              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline disabled:text-slate-300" onClick={() => updatePermissionGroup(editableKeys, false)} disabled={saving || editableKeys.every((key) => permissions[key] !== true)}>{t('Clear all')}</button>
                            </div>
                          )}
                        </header>
                        <div className="grid divide-y divide-slate-100 xl:grid-cols-2 xl:divide-y-0">
                          {items.map((permissionKey) => {
                            const locked = ALWAYS_ON.has(permissionKey);
                            const checked = locked || permissions[permissionKey] === true;
                            const labelText = t(permissionLabels[permissionKey] || permissionKey);
                            return (
                              <label key={permissionKey} className={`flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5 ${locked ? 'bg-slate-50/80' : 'cursor-pointer hover:bg-slate-50'}`}>
                                <input
                                  type="checkbox"
                                  role="switch"
                                  aria-label={labelText}
                                  className="peer sr-only"
                                  checked={checked}
                                  disabled={locked || saving}
                                  onChange={(event) => setPermissions((current) => ({ ...current, [permissionKey]: event.target.checked }))}
                                />
                                <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-700 peer-focus-visible:ring-offset-2 peer-checked:after:translate-x-5 ${checked ? 'bg-emerald-700' : 'bg-slate-300'} ${locked ? 'opacity-70' : ''}`} />
                                <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{labelText}</span>
                                {locked && (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-500">
                                    <FaLock aria-hidden="true" />
                                    {t('Always on')}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                  {catalog.length === 0 && <p className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">{t('No editable permissions for this role.')}</p>}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {!isPlatformAdmin && selectedUser && (
        <div className="sticky bottom-0 z-20 -mx-3 mt-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:-mx-4 md:px-6">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex min-h-10 items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${isDirty ? 'bg-amber-500' : 'bg-slate-300'}`} />
              <span className={isDirty ? 'font-semibold text-amber-800' : 'text-slate-500'}>{isDirty ? t('Unsaved changes') : t('No unsaved changes')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {status === 'pending' && (
                <button type="button" className="min-h-10 rounded-xl border border-emerald-800 px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:opacity-50" onClick={() => savePermissions(true)} disabled={saving || loadingPermissions || !isDirty}>
                  {t('Save & Approve')}
                </button>
              )}
              <button type="button" className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50" onClick={resetChanges} disabled={saving || loadingPermissions || !isDirty}>
                {t('Reset')}
              </button>
              <button type="button" className="min-h-10 rounded-xl bg-emerald-800 px-5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => savePermissions(false)} disabled={saving || loadingPermissions || !isDirty}>
                {saving ? t('Saving...') : t('Save changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-20 right-4 z-40 max-w-[min(24rem,calc(100vw-2rem))] rounded-xl px-4 py-3 text-sm font-medium shadow-lg sm:bottom-20 sm:right-6 ${feedback.type === 'error' ? 'bg-rose-700 text-white' : 'bg-emerald-800 text-white'}`}
        >
          {t(feedback.text)}
        </div>
      )}
    </section>
  );
};

export default UsersPermissionsPage;
