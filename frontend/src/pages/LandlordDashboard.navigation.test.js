import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import { LandlordLayout } from './LandlordDashboard';
import DashboardLayout, {
  getDashboardMenuGroups,
  useDashboardLayout,
} from '../components/DashboardLayout';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'landlord-1', role: 'landlord', name: 'Landlord Example' },
    logout: jest.fn(),
  }),
}));
jest.mock('../components/LanguageSwitcher', () => () => null);
jest.mock('axios', () => {
  const mockGet = jest.fn();
  return {
    __esModule: true,
    default: { get: mockGet },
    get: mockGet,
  };
});

const landlordPages = [
  ['/landlord/add-property', 'Add House'],
  ['/landlord/my-properties', 'My Properties'],
  ['/landlord/verified-properties', 'Verified Properties'],
  ['/landlord/rental-requests', 'Rental Requests'],
  ['/landlord/rented-properties', 'Rented Properties'],
  ['/landlord/under-review', 'Under Review'],
  ['/landlord/rejected', 'Rejected'],
  ['/landlord/rent-payments', 'Rent Payments'],
  ['/landlord/bank-information', 'Bank Information'],
  ['/landlord/account-settings', 'Account Settings'],
];

const TestDashboardHeader = () => {
  const layout = useDashboardLayout();
  return (
    <button
      type="button"
      className="landlord-menu-toggle"
      aria-label={layout.menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
      aria-expanded={layout.menuOpen}
      aria-controls="dashboard-navigation"
      onClick={layout.toggleMenu}
    >
      Menu
    </button>
  );
};

const LayoutRoute = () => {
  const location = useLocation();
  return (
    <LanguageProvider>
      <DashboardLayout
        header={<TestDashboardHeader />}
        menuGroups={getDashboardMenuGroups({ role: 'landlord' }, (value) => value)}
        user={{ id: 'landlord-1', role: 'landlord', name: 'Landlord Example' }}
        title="Landlord"
      >
        <LandlordLayout>
          <output data-testid="current-route">{location.pathname}</output>
        </LandlordLayout>
      </DashboardLayout>
    </LanguageProvider>
  );
};

beforeEach(() => {
  axios.get.mockReturnValue(new Promise(() => {}));
});

test.each(landlordPages)(
  '%s displays a Back to Dashboard link and keeps the sidebar after navigation',
  (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<LayoutRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const backLink = screen.getByRole('link', { name: '← Back to Dashboard' });
    expect(backLink).toHaveAttribute('href', '/landlord-dashboard');
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    fireEvent.click(backLink);

    expect(screen.getByTestId('current-route')).toHaveTextContent('/landlord-dashboard');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  }
);

test('does not add the link to the Landlord Dashboard itself', () => {
  render(
    <MemoryRouter initialEntries={['/landlord-dashboard']}>
      <Routes>
        <Route path="*" element={<LayoutRoute />} />
      </Routes>
    </MemoryRouter>
  );

  expect(screen.queryByRole('link', { name: '← Back to Dashboard' }))
    .not.toBeInTheDocument();
});

test('groups the eleven landlord navigation links and highlights Dashboard', () => {
  render(
    <MemoryRouter initialEntries={['/landlord-dashboard']}>
      <Routes>
        <Route path="*" element={<LayoutRoute />} />
      </Routes>
    </MemoryRouter>
  );

  const navigation = screen.getByRole('navigation');
  expect(within(navigation).getAllByRole('link')).toHaveLength(11);
  expect(within(navigation).getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
  expect(within(navigation).getByRole('heading', { name: 'Rentals' })).toBeInTheDocument();
  expect(within(navigation).getByRole('heading', { name: 'Account' })).toBeInTheDocument();
  expect(within(navigation).getByRole('link', { name: 'Dashboard' }))
    .toHaveAttribute('aria-current', 'page');
});

test.each([
  {
    user: { role: 'tenant' },
    dashboardPath: '/tenant-dashboard',
    expectedPath: '/tenant/search',
    unexpectedPath: '/admin-dashboard/system-logs',
  },
  {
    user: { role: 'admin', adminType: 'area' },
    dashboardPath: '/admin-dashboard',
    expectedPath: '/admin-dashboard/pending',
    unexpectedPath: '/admin-dashboard/system-settings',
  },
  {
    user: { role: 'admin', adminType: 'platform' },
    dashboardPath: '/admin-dashboard',
    expectedPath: '/admin-dashboard/system-logs',
    unexpectedPath: '/admin-dashboard/pending',
  },
])('builds role-appropriate shared navigation', ({ user, dashboardPath, expectedPath, unexpectedPath }) => {
  const groups = getDashboardMenuGroups(user, (value) => value);
  const paths = groups.flatMap(({ items }) => items.map(({ path }) => path));
  expect(paths).toContain(expectedPath);
  expect(paths).not.toContain(unexpectedPath);
  expect(paths[0]).toBe(dashboardPath);
});

test('uses the shared dashboard shell with matching top-bar and sidebar colors', () => {
  render(
    <MemoryRouter initialEntries={['/landlord-dashboard']}>
      <Routes>
        <Route path="*" element={<LayoutRoute />} />
      </Routes>
    </MemoryRouter>
  );

  const sidebar = screen.getByRole('complementary');
  expect(sidebar).toHaveClass('bg-[var(--rv-dashboard-topbar)]');
  expect(sidebar).toHaveClass('rounded-xl', 'w-64', 'overflow-hidden');
  expect(within(sidebar).queryByText('House Rental Management System')).not.toBeInTheDocument();
  expect(sidebar.querySelector('nav')).toHaveClass('flex-1', 'overflow-y-auto');
  expect(sidebar.querySelector('.mt-auto')).toHaveClass('mt-auto');

  const main = screen.getByRole('main');
  expect(main).toHaveClass('flex-1', 'min-w-0', 'p-3', 'md:p-4', 'bg-white');
  expect(document.querySelector('.navbar-topbar')).not.toBeInTheDocument();
});

test('closes the mobile landlord drawer after navigation and outside clicks', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/landlord-dashboard']}>
      <Routes>
        <Route path="*" element={<LayoutRoute />} />
      </Routes>
    </MemoryRouter>
  );
  const menuToggle = container.querySelector('.landlord-menu-toggle');

  fireEvent.click(menuToggle);
  expect(menuToggle)
    .toHaveAttribute('aria-expanded', 'true');
  expect(container.querySelector('.dashboard-layout-sidebar'))
    .toHaveClass('max-md:translate-x-0');

  fireEvent.click(screen.getByRole('link', { name: 'Rental Requests' }));
  expect(screen.getByTestId('current-route')).toHaveTextContent('/landlord/rental-requests');
  expect(screen.getByRole('button', { name: 'Open navigation menu' }))
    .toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(container.querySelector('.landlord-menu-toggle'));
  fireEvent.click(container.querySelector('.dashboard-layout-backdrop'));
  expect(screen.getByRole('button', { name: 'Open navigation menu' }))
    .toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(container.querySelector('.landlord-menu-toggle'));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Open navigation menu' }))
    .toHaveAttribute('aria-expanded', 'false');
});
