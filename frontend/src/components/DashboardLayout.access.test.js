import {
  filterDashboardMenuGroups,
  getDashboardMenuGroups,
  isDashboardMenuItemActive,
} from './DashboardLayout';

const getMenuPaths = (user) => getDashboardMenuGroups(user, (text) => text)
  .flatMap((section) => section.items.map((menuItem) => menuItem.path));

test('platform admins retain platform-wide sidebar destinations', () => {
  const paths = getMenuPaths({ role: 'admin', adminType: 'platform' });

  expect(paths).toContain('/admin-dashboard/admin-management');
  expect(paths).toContain('/admin-dashboard/places');
  expect(paths).toContain('/admin-dashboard/system-logs');
  expect(paths).toContain('/admin-dashboard/system-settings');
  expect(paths.filter((path) => path === '/admin-dashboard/all-users')).toHaveLength(1);
  expect(paths).not.toContain('/admin-dashboard/contact-messages');
});

test('platform_admin gets the full static menu regardless of permission data', () => {
  const user = {
    role: 'admin',
    effectiveRole: 'platform_admin',
    adminType: 'platform',
    permissions: {},
  };
  const menu = getDashboardMenuGroups(user, (text) => text);
  const filtered = filterDashboardMenuGroups(menu, user);
  const paths = filtered.flatMap((section) => section.items.map((menuItem) => menuItem.path));

  expect(paths).toContain('/admin-dashboard/admin-management');
  expect(paths).toContain('/admin-dashboard/places');
  expect(paths).toContain('/admin-dashboard/system-logs');
  expect(paths).toContain('/admin-dashboard/all-properties');
  expect(paths.filter((path) => path === '/admin-dashboard/all-users')).toHaveLength(1);
});

test('area admins only see area-scoped sidebar destinations', () => {
  const paths = getMenuPaths({ role: 'admin', adminType: 'area', assignedArea: 'North' });

  expect(paths).toContain('/admin-dashboard/all-properties');
  expect(paths).toContain('/admin-dashboard/contact-messages');
  expect(paths).not.toContain('/admin-dashboard/all-users');
  expect(paths).not.toContain('/admin-dashboard/admin-management');
  expect(paths).not.toContain('/admin-dashboard/places');
  expect(paths).not.toContain('/admin-dashboard/system-logs');
  expect(paths).not.toContain('/admin-dashboard/system-settings');
});

test('area admin Users sidebar entry stays hidden even when legacy permissions allow it', () => {
  const user = { role: 'admin', adminType: 'area' };
  const groups = getDashboardMenuGroups(user, (text) => text);
  const usersItem = { label: 'Users', path: '/admin-dashboard/all-users' };
  const duplicateMenu = [
    ...groups,
    { label: 'Duplicate Management', items: [{ ...usersItem }] },
    { label: 'Another Duplicate', items: [{ ...usersItem }] },
  ];

  const enabledGroups = filterDashboardMenuGroups(duplicateMenu, {
    ...user,
    permissions: { users: true },
  });
  const enabledPaths = enabledGroups.flatMap((section) => section.items.map((menuItem) => menuItem.path));
  expect(enabledPaths).not.toContain('/admin-dashboard/all-users');

  const disabledGroups = filterDashboardMenuGroups(duplicateMenu, {
    ...user,
    permissions: { users: false },
  });
  const disabledPaths = disabledGroups.flatMap((section) => section.items.map((menuItem) => menuItem.path));
  expect(disabledPaths).not.toContain('/admin-dashboard/all-users');
});

test('area_admin role uses the admin dashboard route and activates the Dashboard sidebar item', () => {
  const groups = getDashboardMenuGroups({ role: 'area_admin' }, (text) => text);
  const dashboardPath = groups[0].items[0].path;

  expect(dashboardPath).toBe('/admin-dashboard');
  expect(isDashboardMenuItemActive('/admin-dashboard', dashboardPath)).toBe(true);
  expect(isDashboardMenuItemActive('/admin-dashboard/all-properties', dashboardPath)).toBe(false);
});

test('disabled area-admin features disappear from the sidebar', () => {
  const groups = getDashboardMenuGroups({ role: 'admin', adminType: 'area' }, (text) => text);
  const filteredGroups = filterDashboardMenuGroups(groups, {
    role: 'admin',
    adminType: 'area',
    permissions: { pendingProperties: false, allProperties: true, verifiedProperties: true },
  });
  const paths = filteredGroups.flatMap((section) => section.items.map((menuItem) => menuItem.path));

  expect(paths).not.toContain('/admin-dashboard/pending');
  expect(paths).toContain('/admin-dashboard/all-properties');
  expect(paths).toContain('/admin-dashboard/verified');
});

test('missing permissions safely show only always-on items', () => {
  const groups = getDashboardMenuGroups({ role: 'admin', adminType: 'area' }, (text) => text);
  const filteredGroups = filterDashboardMenuGroups(groups, {
    role: 'admin',
    adminType: 'area',
    permissions: [],
  });
  const paths = filteredGroups.flatMap((section) => section.items.map((menuItem) => menuItem.path));

  expect(paths).toContain('/admin-dashboard');
  expect(paths).toContain('/admin-dashboard/profile');
  expect(paths).not.toContain('/admin-dashboard/all-properties');
});

test('permission loading keeps the layout available with only always-on destinations', () => {
  const groups = getDashboardMenuGroups({ role: 'admin', adminType: 'area' }, (text) => text);
  const filteredGroups = filterDashboardMenuGroups(groups, {
    role: 'admin',
    adminType: 'area',
    permissions: { allProperties: true, dashboard: true },
  }, true);
  const paths = filteredGroups.flatMap((section) => section.items.map((menuItem) => menuItem.path));

  expect(paths).toContain('/admin-dashboard');
  expect(paths).toContain('/admin-dashboard/profile');
  expect(paths).not.toContain('/admin-dashboard/all-properties');
});

test('locked dashboard and account settings remain visible for tenant users', () => {
  const groups = getDashboardMenuGroups({ role: 'tenant' }, (text) => text);
  const filteredGroups = filterDashboardMenuGroups(groups, {
    role: 'tenant',
    permissions: { dashboard: true, accountSettings: true, favorites: false },
  });
  const paths = filteredGroups.flatMap((section) => section.items.map((menuItem) => menuItem.path));

  expect(paths).toContain('/tenant-dashboard');
  expect(paths).toContain('/tenant/account-settings');
  expect(paths).not.toContain('/tenant/favorites');
});
