import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import DashboardLayout, { getDashboardMenuGroups } from '../components/DashboardLayout';
import LandlordDashboard, { LandlordLayout } from './LandlordDashboard';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

let mockLandlordPermissions;

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'landlord-1',
      role: 'landlord',
      name: 'Alex Landlord',
      permissions: mockLandlordPermissions,
    },
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
          { id: 'landlord-1', role: 'landlord', name: 'Alex Landlord', permissions: mockLandlordPermissions },
          (value) => value
        )}
        user={{ id: 'landlord-1', role: 'landlord', name: 'Alex Landlord', permissions: mockLandlordPermissions }}
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
  mockLandlordPermissions = {
    addProperty: true,
    myProperties: true,
    verifiedProperties: true,
    underReview: true,
    rejectedProperties: true,
    rentalRequests: true,
    rentedProperties: true,
    rentPayments: true,
    bankInformation: true,
    messages: true,
    reviews: true,
    notifications: true,
    dashboard: true,
    accountSettings: true,
    changePassword: true,
  };
  localStorage.setItem('token', 'test-token');
});

test('renders the welcome header, linked stat cards, and recent requests', async () => {
  configureResponses();
  renderDashboard();

  const main = within(screen.getByRole('main'));
  expect((await screen.findAllByText('Taylor Tenant')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Morgan Tenant').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Bole Home').length).toBeGreaterThan(0);
  expect(main.getByRole('heading', { name: 'Welcome back, Alex Landlord' }))
    .toHaveClass('!text-white');
  expect(main.getByRole('time')).toHaveClass('ml-auto', 'text-right', 'text-white/90');
  expect(main.queryByText('Here is what is happening on the platform today.'))
    .not.toBeInTheDocument();
  expect(main.queryByText(/rental requests waiting and .* unread notifications/))
    .not.toBeInTheDocument();
  expect(document.querySelector('.dashboard-welcome-banner'))
    .toHaveClass('!bg-green-700', '!rounded-2xl', '!shadow-sm');
  expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);

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
  expect(main.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/landlord/rental-requests');
  expect(main.getAllByRole('link', { name: 'View' }).length).toBeGreaterThanOrEqual(2);
  expect(main.getByRole('link', { name: /Rental Requests/ })).toHaveTextContent('2 total');
  expect(main.getByRole('link', { name: /Rental Requests/ })).toHaveTextContent('1 pending');
});

test('dashboard and permitted widgets load when Rejected Properties is disabled', async () => {
  mockLandlordPermissions.rejectedProperties = false;
  configureResponses();
  renderDashboard();

  expect(await screen.findByRole('heading', { name: 'Welcome back, Alex Landlord' })).toBeInTheDocument();
  expect(within(screen.getByRole('main')).getByRole('link', { name: /My Properties/ })).toHaveAttribute('href', '/landlord/my-properties');
  expect(screen.queryByRole('link', { name: 'Rejected' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Recent Rental Requests' })).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/properties'),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
  );
});

test('a denied optional dashboard widget does not replace the dashboard', async () => {
  configureResponses();
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/payments/landlord')) {
      return Promise.reject({ response: { status: 403, data: { message: 'Permission denied' } } });
    }
    if (url.includes('/api/notifications/unread-count')) return response({ unreadCount: 3 });
    if (url.includes('limit=5')) return response(recentRequests);
    if (url.includes('/api/properties')) return response([]);
    if (url.includes('/api/rental-requests/landlord-requests')) return response(recentRequests);
    return Promise.reject(new Error(`Unexpected dashboard request: ${url}`));
  });
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  try {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Welcome back, Alex Landlord' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Permission denied' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Properties' })).toBeInTheDocument();
  } finally {
    consoleError.mockRestore();
  }
});

test('property form derives area from the address and has no manual area dropdown', async () => {
  configureResponses();
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/landlord/add-property']}>
        <LandlordDashboard initialShowForm />
      </MemoryRouter>
    </LanguageProvider>,
  );

  expect(await screen.findByText('Address *')).toBeInTheDocument();
  expect(screen.queryByLabelText('Area *')).not.toBeInTheDocument();
  expect(document.querySelector('[name="area"]')).not.toBeInTheDocument();
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

test('hides the recent requests widget if its request is denied', async () => {
  configureResponses({ failRecent: true });
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  try {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Welcome back, Alex Landlord' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Recent Rental Requests' })).not.toBeInTheDocument();
    });
  } finally {
    consoleError.mockRestore();
  }
});
