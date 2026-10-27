import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../context/LanguageContext';
import DashboardLayout, { getDashboardMenuGroups } from '../components/DashboardLayout';
import LandlordDashboard, { LandlordLayout } from './LandlordDashboard';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
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
  axios.post.mockReset();
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
});

test('Add Property shows completion progress and removable image previews', async () => {
  configureResponses();
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/landlord/add-property']}>
        <LandlordDashboard initialShowForm />
      </MemoryRouter>
    </LanguageProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Add a new property' })).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Form completion' })).toHaveAttribute('aria-valuenow', '0');
  expect(screen.getByRole('form', { name: 'Add property form' })).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('Example: House in Bole'), { target: { value: 'Bole house' } });
  expect(screen.getByRole('progressbar', { name: 'Form completion' })).toHaveAttribute('aria-valuenow', '8');

  const imagesInput = screen.getByLabelText(/Choose property images/);
  const imageFiles = [
    new File(['image one'], 'front.png', { type: 'image/png' }),
    new File(['image two'], 'inside.png', { type: 'image/png' }),
  ];
  fireEvent.change(imagesInput, { target: { files: imageFiles } });

  expect(await screen.findByRole('heading', { name: 'Property images (2/5)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove front.png' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove front.png' }));
  expect(screen.getByRole('heading', { name: 'Property images (1/5)' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove front.png' })).not.toBeInTheDocument();
});

test('Add Property keeps the existing submit endpoint and FormData fields', async () => {
  configureResponses();
  axios.post.mockResolvedValue({ data: { message: 'Property submitted' } });
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/landlord/add-property']}>
        <LandlordDashboard initialShowForm />
      </MemoryRouter>
    </LanguageProvider>,
  );

  await screen.findByRole('heading', { name: 'Add a new property' });
  const fieldValues = {
    title: 'Bole House',
    description: 'A sunny property',
    price: '8000',
    bedrooms: '2',
    region: 'Oromiya',
    zone: 'Addis Ababa',
    wereda: 'Wereda 03',
    city: 'Addis Ababa',
    subCity: 'Bole',
    kebele: '01',
    houseNumber: '12',
  };
  const placeholders = {
    title: 'Example: House in Bole',
    description: 'Enter a property description',
    price: 'Price',
    bedrooms: 'Number of bedrooms',
    region: 'Region',
    zone: 'Zone',
    wereda: 'Wereda',
    city: 'City',
    subCity: 'Sub-city',
    kebele: 'Kebele',
    houseNumber: 'House number',
  };
  Object.entries(fieldValues).forEach(([name, value]) => {
    fireEvent.change(screen.getByPlaceholderText(placeholders[name]), { target: { value } });
  });
  const imageFile = new File(['image'], 'front.png', { type: 'image/png' });
  const proofFile = new File(['proof'], 'ownership.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText(/Choose property images/), { target: { files: [imageFile] } });
  fireEvent.change(screen.getByLabelText(/Choose proof of ownership/), { target: { files: [proofFile] } });
  fireEvent.submit(screen.getByRole('form', { name: 'Add property form' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  const [url, submittedFormData] = axios.post.mock.calls[0];
  expect(url).toContain('/api/properties');
  Object.entries(fieldValues).forEach(([name, value]) => {
    expect(submittedFormData.get(name)).toBe(value);
  });
  expect(submittedFormData.getAll('images')).toHaveLength(1);
  expect(submittedFormData.get('document')).toBe(proofFile);
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
