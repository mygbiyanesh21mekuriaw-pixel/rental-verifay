import React from 'react';
import { render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import DashboardLayout, { getDashboardMenuGroups } from '../components/DashboardLayout';
import LandlordDashboard, { LandlordLayout } from './LandlordDashboard';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'landlord-1', role: 'landlord', name: 'Alex Landlord' },
    logout: jest.fn(),
  }),
}));

const recentRequests = [
  {
    _id: 'request-pending',
    tenant: { name: 'Taylor Tenant' },
    property: { title: 'Bole Home' },
    createdAt: '2026-10-14T12:00:00.000Z',
    status: 'pending',
  },
  {
    _id: 'request-approved',
    tenant: { name: 'Morgan Tenant' },
    property: { title: 'Kirkos Apartment' },
    createdAt: '2026-10-13T12:00:00.000Z',
    status: 'confirmed',
  },
];

const response = (data) => Promise.resolve({ data });

const configureResponses = ({ requests = recentRequests, failRecent = false } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/notifications/unread-count')) return response({ unreadCount: 3 });
    if (url.includes('limit=5')) {
      return failRecent ? Promise.reject(new Error('Recent requests unavailable')) : response(requests);
    }
    if (url.includes('/api/properties')) return response([]);
    if (url.includes('/api/rental-requests/landlord-requests')) return response(requests);
    if (url.includes('/api/payments/landlord')) return response([]);
    return Promise.reject(new Error(`Unexpected dashboard request: ${url}`));
  });
};

const renderDashboard = () => render(
  <LanguageProvider>
    <MemoryRouter initialEntries={['/landlord-dashboard']}>
      <DashboardLayout
        header={<div />}
        menuGroups={getDashboardMenuGroups(
          { id: 'landlord-1', role: 'landlord', name: 'Alex Landlord' },
          (value) => value
        )}
        user={{ id: 'landlord-1', role: 'landlord', name: 'Alex Landlord' }}
        title="Landlord"
      >
        <Routes>
          <Route
            path="/landlord-dashboard"
            element={(
              <LandlordLayout>
                <LandlordDashboard />
              </LandlordLayout>
            )}
          />
        </Routes>
      </DashboardLayout>
    </MemoryRouter>
  </LanguageProvider>
);

beforeEach(() => {
  axios.get.mockReset();
  localStorage.setItem('token', 'test-token');
});

test('renders the welcome header, linked stat cards, and recent requests', async () => {
  configureResponses();
  renderDashboard();

  const main = within(screen.getByRole('main'));
  expect(await screen.findByText('Taylor Tenant')).toBeInTheDocument();
  expect(screen.getByText('Morgan Tenant')).toBeInTheDocument();
  expect(screen.getByText('Bole Home')).toBeInTheDocument();
  expect(main.getByRole('heading', { name: 'Welcome back, Alex Landlord' }))
    .toHaveClass('text-white');
  expect(main.getByRole('time')).toHaveClass('ml-auto', 'text-right', 'text-white/90');
  expect(main.queryByText('Here is what is happening on the platform today.'))
    .not.toBeInTheDocument();
  expect(main.queryByText(/rental requests waiting and .* unread notifications/))
    .not.toBeInTheDocument();
  expect(document.querySelector('.dashboard-welcome-banner'))
    .toHaveClass('!bg-green-700', 'rounded-2xl', 'shadow-sm');
  expect(screen.getByText('Pending')).toBeInTheDocument();
  expect(screen.getByText('Approved')).toBeInTheDocument();

  [
    ['My Properties', '/landlord/my-properties'],
    ['Verified Properties', '/landlord/verified-properties'],
    ['Rental Requests', '/landlord/rental-requests'],
    ['Rented Properties', '/landlord/rented-properties'],
    ['Rent Payments', '/landlord/rent-payments'],
    ['Notifications', '/landlord/notifications'],
  ].forEach(([label, path]) => {
    expect(main.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('href', path);
  });
  expect(screen.getByText('Unread')).toBeInTheDocument();
  expect(screen.getByLabelText('Notifications')).toHaveTextContent('3');
  expect(main.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/landlord/rental-requests');
  expect(main.getAllByRole('link', { name: 'View' })).toHaveLength(2);
  expect(main.getByRole('link', { name: /Rental Requests/ })).toHaveTextContent('2 total');
  expect(main.getByRole('link', { name: /Rental Requests/ })).toHaveTextContent('1 pending');
});

test('shows total and pending rental request counts when requests are closed', async () => {
  configureResponses({
    requests: Array.from({ length: 22 }, (_, index) => ({
      _id: `request-${index}`,
      tenant: { name: `Tenant ${index}` },
      property: { title: `Property ${index}` },
      createdAt: '2026-10-14T12:00:00.000Z',
      status: 'approved',
    })),
  });
  renderDashboard();

  const rentalRequestsCard = within(screen.getByRole('main')).getByRole('link', { name: /Rental Requests/ });
  expect(await within(rentalRequestsCard).findByText('22 total')).toBeInTheDocument();
  expect(within(rentalRequestsCard).getByText('0 pending')).toBeInTheDocument();
  expect(screen.queryByText(/No pending rental requests/)).not.toBeInTheDocument();
});

test('shows the loading state while recent rental requests are being fetched', async () => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/notifications/unread-count')) return response({ unreadCount: 3 });
    if (url.includes('limit=5')) return new Promise(() => {});
    if (url.includes('/api/properties')) return response([]);
    if (url.includes('/api/rental-requests/landlord-requests')) return response([]);
    if (url.includes('/api/payments/landlord')) return response([]);
    return Promise.reject(new Error(`Unexpected dashboard request: ${url}`));
  });

  renderDashboard();
  expect(screen.getByRole('status')).toHaveTextContent('Loading recent rental requests...');
});

test('shows the empty state when there are no recent requests', async () => {
  configureResponses({ requests: [] });
  renderDashboard();

  expect(await screen.findByText('No requests yet')).toBeInTheDocument();
});

test('shows an error state if recent requests fail to load', async () => {
  configureResponses({ failRecent: true });
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  renderDashboard();
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load recent rental requests.');
  consoleError.mockRestore();
});
