import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TenantDashboard from './TenantDashboard';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  put: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text) => text,
    formatDate: (date) => date.toLocaleDateString('en-US'),
    formatCurrency: (amount) => `ETB ${Number(amount).toLocaleString()}`,
  }),
}));

const rentalRequests = [
  {
    _id: 'request-1',
    status: 'pending',
    createdAt: '2026-10-14T12:00:00.000Z',
    property: { title: 'Bole Home' },
  },
];

const tenantNotifications = [
  {
    _id: 'notification-1',
    propertyTitle: 'Bole Home',
    message: 'Your rental request is pending.',
    read: false,
    createdAt: '2026-10-15T12:00:00.000Z',
  },
];

const availableProperties = [
  {
    _id: 'property-1',
    title: 'New Apartment',
    location: 'Addis Ababa',
    price: 12000,
    images: [],
  },
];

const renderDashboard = () => render(
  <MemoryRouter>
    <TenantDashboard />
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.setItem('token', 'tenant-token');
  useAuth.mockReturnValue({ user: { role: 'tenant', name: 'dawit' } });
  axios.get.mockReset();
  axios.put.mockReset().mockResolvedValue({ data: { success: true } });
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/properties')) return Promise.resolve({ data: availableProperties });
    if (url.includes('/api/rent-requests/my-requests')) return Promise.resolve({ data: rentalRequests });
    if (url.includes('/api/favorites')) return Promise.resolve({ data: [] });
    if (url.includes('/api/notifications')) {
      return Promise.resolve({ data: { unreadCount: 1, notifications: tenantNotifications } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

test('shows tenant-scoped totals and clickable stat cards with the matching routes', async () => {
  renderDashboard();

  expect(await screen.findByRole('heading', { name: 'Welcome back, Dawit' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /Available Properties 1/ }))
    .toHaveAttribute('href', '/tenant/verified-properties');
  expect(screen.getByRole('link', { name: /Total Requests 1/ }))
    .toHaveAttribute('href', '/tenant/rental-requests');
  expect(screen.getByRole('link', { name: /Favorite Properties 0/ }))
    .toHaveAttribute('href', '/tenant/favorites');
  expect(screen.getByRole('link', { name: /Unread Notifications 1/ }))
    .toHaveAttribute('href', '/tenant/notifications');
  const recentRequests = screen.getByRole('region', { name: 'Recent Rental Requests' });
  expect(await within(recentRequests).findByRole('link', { name: 'View', exact: true }))
    .toHaveAttribute('href', '/tenant/rental-requests/request-1');
  const recentNotifications = screen.getByRole('region', { name: 'Recent Notifications' });
  expect(within(recentNotifications).getByRole('link', { name: 'View all' }))
    .toHaveAttribute('href', '/tenant/notifications');
  expect(screen.getByRole('link', { name: /Available Properties/ }))
    .toHaveClass('cursor-pointer', 'focus-visible:ring-2');
  expect(await screen.findAllByText('Bole Home')).toHaveLength(2);
  expect(screen.getByText('New Apartment')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/rent-requests/my-requests'),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tenant-token' }) }),
  );
});

test('marks an individual notification read and can mark all remaining notifications read', async () => {
  renderDashboard();

  const markRead = await screen.findByRole('button', { name: 'Mark as read' });
  fireEvent.click(markRead);

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/notifications/notification-1/read'),
    {},
    expect.any(Object),
  ));
  await waitFor(() => expect(screen.getByRole('link', { name: /Unread Notifications 0/ })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument();
});

test('marks all recent notifications as read', async () => {
  renderDashboard();

  fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/notifications/read-all'),
    {},
    expect.any(Object),
  ));
  expect(await screen.findByRole('link', { name: /Unread Notifications 0/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
});

test('renders retry controls when a dashboard section API fails', async () => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/properties')) return Promise.reject(new Error('Network error'));
    if (url.includes('/api/rent-requests/my-requests')) return Promise.resolve({ data: [] });
    if (url.includes('/api/favorites')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: { unreadCount: 0, notifications: [] } });
  });
  renderDashboard();

  expect(await screen.findByText('Unable to load available properties.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
});
