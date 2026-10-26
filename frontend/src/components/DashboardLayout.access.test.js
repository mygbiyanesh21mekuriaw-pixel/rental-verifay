import { getDashboardMenuGroups } from './DashboardLayout';

const getMenuPaths = (user) => getDashboardMenuGroups(user, (text) => text)
  .flatMap((section) => section.items.map((menuItem) => menuItem.path));

test('platform admins retain platform-wide sidebar destinations', () => {
  const paths = getMenuPaths({ role: 'admin', adminType: 'platform' });

  expect(paths).toContain('/admin-dashboard/admin-management');
  expect(paths).toContain('/admin-dashboard/places');
  expect(paths).toContain('/admin-dashboard/system-logs');
  expect(paths).toContain('/admin-dashboard/system-settings');
  expect(paths).toContain('/admin-dashboard/all-users');
  expect(paths).not.toContain('/admin-dashboard/contact-messages');
});

test('area admins only see area-scoped sidebar destinations', () => {
  const paths = getMenuPaths({ role: 'admin', adminType: 'area', assignedArea: 'North' });

  expect(paths).toContain('/admin-dashboard/all-properties');
  expect(paths).toContain('/admin-dashboard/all-users');
  expect(paths).toContain('/admin-dashboard/contact-messages');
  expect(paths).not.toContain('/admin-dashboard/admin-management');
  expect(paths).not.toContain('/admin-dashboard/places');
  expect(paths).not.toContain('/admin-dashboard/system-logs');
  expect(paths).not.toContain('/admin-dashboard/system-settings');
});
