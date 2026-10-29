import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FaBuilding,
  FaChartBar,
  FaCheck,
  FaClipboardList,
  FaCog,
  FaCreditCard,
  FaEnvelope,
  FaFileAlt,
  FaHardHat,
  FaHeart,
  FaHome,
  FaHourglassHalf,
  FaMoneyBill,
  FaMap,
  FaPlus,
  FaSearch,
  FaShieldAlt,
  FaTh,
  FaTimes,
  FaUser,
  FaUsers,
} from 'react-icons/fa';
import ProfileAvatar from './ProfileAvatar';
import { useLanguage } from '../context/LanguageContext';

const DashboardLayoutContext = createContext(null);

export const useDashboardLayout = () => useContext(DashboardLayoutContext);

const item = (label, path, Icon) => ({ label, path, Icon });
const group = (label, items) => ({ label, items });
const dashboardPathForUser = (user) => {
  const role = user?.effectiveRole || user?.role;
  if (['admin', 'area_admin', 'platform_admin'].includes(role)) return '/admin-dashboard';
  return `/${role}-dashboard`;
};

export const isDashboardMenuItemActive = (pathname, path) => (
  pathname === path ||
  (path !== '/landlord-dashboard' && path !== '/tenant-dashboard' && path !== '/admin-dashboard' &&
    pathname.startsWith(`${path}/`)) ||
  (path === '/landlord/add-property' && pathname.startsWith('/landlord/edit-property')) ||
  (path === '/landlord/rejected' && pathname === '/landlord/rejected-properties')
);

const ALWAYS_ON_PERMISSION_KEYS = ['dashboard', 'accountSettings', 'changePassword'];

const featureKeyForPath = (path) => ({
  '/landlord/add-property': 'addProperty',
  '/landlord/my-properties': 'myProperties',
  '/landlord/verified-properties': 'verifiedProperties',
  '/landlord/under-review': 'underReview',
  '/landlord/rejected': 'rejectedProperties',
  '/landlord/rental-requests': 'rentalRequests',
  '/landlord/rented-properties': 'rentedProperties',
  '/landlord/rent-payments': 'rentPayments',
  '/landlord/bank-information': 'bankInformation',
  '/landlord/account-settings': 'accountSettings',
  '/landlord/profile': 'accountSettings',
  '/landlord/messages': 'messages',
  '/landlord/contact-admin': 'messages',
  '/landlord/notifications': 'notifications',
  '/landlord/reviews': 'reviews',
  '/tenant/verified-properties': 'verifiedProperties',
  '/tenant/favorites': 'favorites',
  '/tenant/search': 'searchProperties',
  '/tenant/rental-requests': 'rentalRequests',
  '/tenant/rented-property': 'rentedProperty',
  '/tenant/account-settings': 'accountSettings',
  '/tenant/messages': 'messages',
  '/tenant/contact-admin': 'messages',
  '/tenant/notifications': 'notifications',
  '/tenant/rent-payment': 'rentPayments',
  '/tenant/recently-viewed': 'recentlyViewed',
  '/admin-dashboard/all-properties': 'allProperties',
  '/admin-dashboard/pending': 'pendingProperties',
  '/admin-dashboard/verified': 'verifiedProperties',
  '/admin-dashboard/rejected': 'rejectedProperties',
  '/admin-dashboard/rental-requests': 'rentalRequests',
  '/admin-dashboard/messages': 'messages',
  '/admin-dashboard/contact-messages': 'contactMessages',
  '/admin-dashboard/profile': 'accountSettings',
}[path]);

export const getDashboardMenuGroups = (user, t) => {
  const role = user?.effectiveRole || user?.role;
  const dashboard = group(null, [
    item('Dashboard', dashboardPathForUser(user), FaChartBar),
  ]);

  if (role === 'landlord') {
    return [
      dashboard,
      group('Properties', [
        item('Add House', '/landlord/add-property', FaPlus),
        item('My Properties', '/landlord/my-properties', FaHome),
        item('Verified Properties', '/landlord/verified-properties', FaCheck),
        item('Under Review', '/landlord/under-review', FaHourglassHalf),
        item('Rejected', '/landlord/rejected', FaTimes),
      ]),
      group('Rentals', [
        item('Rental Requests', '/landlord/rental-requests', FaFileAlt),
        item('Rented Properties', '/landlord/rented-properties', FaHardHat),
        item('Rent Payments', '/landlord/rent-payments', FaMoneyBill),
      ]),
      group('Management', [
        item('Messages', '/landlord/contact-admin', FaEnvelope),
      ]),
      group('Account', [
        item('Bank Information', '/landlord/bank-information', FaCreditCard),
        item('Account Settings', '/landlord/account-settings', FaCog),
      ]),
    ];
  }

  if (role === 'tenant') {
    return [
      dashboard,
      group('Properties', [
        item('Verified Properties', '/tenant/verified-properties', FaCheck),
        item('Favorites', '/tenant/favorites', FaHeart),
        item('Search Properties', '/tenant/search', FaSearch),
      ]),
      group('Rentals', [
        item('Rental Requests', '/tenant/rental-requests', FaFileAlt),
        item('Rented Property', '/tenant/rented-property', FaBuilding),
      ]),
      group('Management', [
        item('Messages', '/tenant/contact-admin', FaEnvelope),
      ]),
      group('Account', [
        item('Account Settings', '/tenant/account-settings', FaCog),
      ]),
    ];
  }

  if (['admin', 'area_admin', 'platform_admin'].includes(role)) {
    const isPlatform = role === 'platform_admin' ||
      (role === 'admin' && (
        user.adminType === 'platform' ||
        (!user.adminType && (user.adminAreas || []).length === 0)
      ));
    if (isPlatform) {
      return [
        dashboard,
        group('Management', [
          item('Admin Management', '/admin-dashboard/admin-management', FaShieldAlt),
          item('Ethiopia Places', '/admin-dashboard/places', FaMap),
          item('Users', '/admin-dashboard/all-users', FaUsers),
          item('Roles & Permissions', '/admin-dashboard/users-permissions', FaUsers),
          item('Properties', '/admin-dashboard/all-properties', FaBuilding),
          item('Admin Analytics', '/admin-dashboard/analytics', FaChartBar),
          item('Payment Period', '/admin-dashboard/payment-period', FaCreditCard),
        ]),
        group('System', [
          item('Audit Log', '/admin-dashboard/system-logs', FaClipboardList),
          item('System Settings', '/admin-dashboard/system-settings', FaCog),
        ]),
        group('Account', [
          item('Account Settings', '/admin-dashboard/profile', FaUser),
        ]),
      ];
    }

    return [
      dashboard,
      group('Properties', [
        item('Properties', '/admin-dashboard/all-properties', FaBuilding),
        item('Under Review', '/admin-dashboard/pending', FaHourglassHalf),
        item('Verified', '/admin-dashboard/verified', FaCheck),
        item('Rejected', '/admin-dashboard/rejected', FaTimes),
      ]),
      group('Management', [
        item('Contact Messages', '/admin-dashboard/contact-messages', FaEnvelope),
        item('Messages', '/admin-dashboard/messages', FaEnvelope),
      ]),
      group('Rentals', [
        item('Rental Requests', '/admin-dashboard/rental-requests', FaClipboardList),
      ]),
      group('Account', [
        item('Account Settings', '/admin-dashboard/profile', FaUser),
      ]),
    ];
  }

  return [group(null, [item(t('Dashboard'), '/', FaTh)])];
};

export const filterDashboardMenuGroups = (menuGroups, user, permissionLoading = false) => {
  const safeMenuGroups = Array.isArray(menuGroups) ? menuGroups : [];
  const role = user?.effectiveRole || user?.role;
  const seenPaths = new Set();
  const uniqueMenuGroups = safeMenuGroups.map((section) => ({
    ...section,
    items: section.items.filter(({ path }) => {
      if (seenPaths.has(path)) return false;
      seenPaths.add(path);
      return true;
    }),
  }));
  if (['platform_admin'].includes(role) ||
    (user?.role === 'admin' && (
      user.adminType === 'platform' ||
      (!user.adminType && (user.adminAreas || []).length === 0)
    ))) {
    return uniqueMenuGroups;
  }

  const permissions = user?.permissions &&
    typeof user.permissions === 'object' &&
    !Array.isArray(user.permissions) &&
    Object.keys(user.permissions).length > 0
    ? user.permissions
    : null;
  const useOnlyAlwaysOn = permissionLoading || !permissions;

  return uniqueMenuGroups
  .map((section) => ({
    ...section,
    items: section.items.filter(({ path }) => {
      if (path === '/admin-dashboard/all-users') return false;
      const featureKey = featureKeyForPath(path);
      if (!featureKey) return true;
      if (useOnlyAlwaysOn) return ALWAYS_ON_PERMISSION_KEYS.includes(featureKey);
      return permissions[featureKey] === true;
    }),
  }))
  .filter((section) => section.items.length > 0);
};

const DashboardLayout = ({
  children,
  header,
  menuGroups,
  user,
  title,
  permissionLoading = false,
  permissionError = '',
}) => {
  const location = useLocation();
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setUnreadCount] = useState(null);
  const contextValue = useMemo(() => ({
    menuOpen,
    toggleMenu: () => setMenuOpen((open) => !open),
    closeMenu: () => setMenuOpen(false),
    setUnreadCount,
    title,
  }), [menuOpen, setUnreadCount, title]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const groups = filterDashboardMenuGroups(
    menuGroups || getDashboardMenuGroups(user, t),
    user,
    permissionLoading,
  );
  const effectiveRole = user?.effectiveRole || user?.role;
  const roleLabel = title || (
    ['admin', 'area_admin', 'platform_admin'].includes(effectiveRole)
      ? t(effectiveRole === 'area_admin' || user.adminType === 'area' ? 'Area Admin' : 'Platform Admin')
      : t(effectiveRole === 'landlord' ? 'Landlord' : 'Tenant')
  );

  return (
    <DashboardLayoutContext.Provider value={contextValue}>
      <div className="flex h-screen min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-100 text-slate-900">
        <header className="z-30 w-full shrink-0">{header}</header>
        <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-4 max-md:gap-0">
          <button
            type="button"
            className={`dashboard-layout-backdrop fixed inset-0 z-40 hidden border-0 bg-slate-950/50 p-0 focus-visible:outline-none md:hidden ${menuOpen ? '!block' : ''}`}
            onClick={() => setMenuOpen(false)}
            aria-label={t('Close navigation drawer')}
            aria-hidden={!menuOpen}
            tabIndex={menuOpen ? 0 : -1}
          />
          <aside
            id="dashboard-navigation"
            className={`dashboard-layout-sidebar z-50 flex w-64 shrink-0 flex-col overflow-hidden rounded-xl bg-[var(--rv-dashboard-topbar)] text-blue-50 shadow-sm max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:h-full max-md:max-h-screen max-md:rounded-none max-md:transition-transform max-md:duration-200 md:relative ${
              menuOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
            }`}
          >
            <nav aria-label={t('Dashboard navigation')} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
              {permissionLoading && (
                <p role="status" className="mb-3 px-3 text-xs text-white/75">
                  {t('Loading permissions…')}
                </p>
              )}
              {permissionError && (
                <p role="alert" className="mb-3 rounded-md bg-white/10 px-3 py-2 text-xs leading-relaxed text-white">
                  {t(permissionError)}
                </p>
              )}
              {groups.map((section, sectionIndex) => (
                <div key={section.label || `dashboard-${sectionIndex}`} className={section.label ? 'mt-4 first:mt-0' : 'first:mt-0'}>
                  {section.label && (
                    <h2 className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/75">
                      {t(section.label)}
                    </h2>
                  )}
                  {section.items.map(({ label, path, Icon }) => {
                    const isActive = isDashboardMenuItemActive(location.pathname, path);
                    return (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setMenuOpen(false)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex min-h-10 items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium text-white/80 no-underline transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
                          isActive ? 'border-white bg-white/15 font-semibold text-white shadow-inner' : ''
                        }`}
                      >
                        <Icon aria-hidden="true" className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{t(label)}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="mt-auto shrink-0 border-t border-white/10 p-3">
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-3 py-3">
                <ProfileAvatar user={user} className="!h-9 !w-9 shrink-0 !text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user?.name || ''}</p>
                  <p className="truncate text-xs text-white/75">{user?.email || ''}</p>
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-white/75">{roleLabel}</p>
                </div>
              </div>
            </div>
          </aside>
          <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-xl bg-white p-3 md:p-4">
            {location.state?.featureDisabled && (
              <div role="alert" className="mb-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('This feature is currently disabled for your role.')}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </DashboardLayoutContext.Provider>
  );
};

export default DashboardLayout;
