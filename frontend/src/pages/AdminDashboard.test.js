import React from 'react';
import axios from 'axios';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard, { buildMonthlyPropertySeries } from './AdminDashboard';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => {
  const translate = (value) => value;
  return { useLanguage: () => ({ t: translate }) };
});

const platformAdmin = { role: 'admin', adminType: 'platform', name: 'Admin Example' };
const pendingProperty = {
  _id: 'property-pending',
  title: 'Pending house',
  location: 'Mekdela Amba',
  price: 12000,
  verificationStatus: 'pending',
  createdAt: '2026-01-10T00:00:00.000Z',
  landlord: { name: 'Property owner' },
};
const approvedProperty = {
  _id: 'property-approved',
  title: 'Verified house',
  isVerified: true,
  verificationStatus: 'approved',
};
const inconsistentProperty = {
  _id: 'property-inconsistent',
  title: 'Legacy house',
  isVerified: false,
  verificationStatus: 'approved',
};

const renderDashboard = () => render(
  <MemoryRouter>
    <AdminDashboard />
  </MemoryRouter>,
);
const getRentalCount = (status) => Array.from(document.querySelectorAll('.admin-dashboard-rental-counts li'))
  .find((item) => item.querySelector('span')?.textContent === status);

test('monthly property series includes zero months across year boundaries and excludes leading empty months', () => {
  const series = buildMonthlyPropertySeries([
    { createdAt: new Date(2024, 7, 10).toISOString() },
    { createdAt: new Date(2024, 9, 2).toISOString() },
    { createdAt: new Date(2025, 0, 4).toISOString() },
  ], new Date(2025, 0, 15));

  expect(series).toEqual([
    { key: '2024-08', label: 'Aug', value: 1 },
    { key: '2024-09', label: 'Sep', value: 0 },
    { key: '2024-10', label: 'Oct', value: 1 },
    { key: '2024-11', label: 'Nov', value: 0 },
    { key: '2024-12', label: 'Dec', value: 0 },
    { key: '2025-01', label: 'Jan', value: 1 },
  ]);
});

test('monthly property series starts at earliest property when within six months and caps older history', () => {
  const earlySeries = buildMonthlyPropertySeries([
    { createdAt: new Date(2025, 9, 11).toISOString() },
    { createdAt: new Date(2025, 11, 1).toISOString() },
  ], new Date(2025, 11, 15));
  expect(earlySeries).toEqual([
    { key: '2025-10', label: 'Oct', value: 1 },
    { key: '2025-11', label: 'Nov', value: 0 },
    { key: '2025-12', label: 'Dec', value: 1 },
  ]);

  const cappedSeries = buildMonthlyPropertySeries([
    { createdAt: new Date(2024, 0, 1).toISOString() },
  ], new Date(2025, 5, 15));
  expect(cappedSeries).toHaveLength(6);
  expect(cappedSeries.map(({ key }) => key)).toEqual([
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
  ]);
});

test('monthly property chart keeps a single month in a compact centered column', () => {
  const series = buildMonthlyPropertySeries([
    { createdAt: new Date().toISOString() },
  ]);

  expect(series).toHaveLength(1);
});

beforeEach(() => {
  localStorage.setItem('token', 'admin-token');
  useAuth.mockReturnValue({ user: platformAdmin });
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/admin/properties')) return Promise.resolve({ data: [pendingProperty, approvedProperty, inconsistentProperty] });
    if (url.endsWith('/api/admin/stats')) return Promise.resolve({
      data: { totalUsers: 8, platformAdmins: 1, areaAdmins: 3 },
    });
    if (url.endsWith('/api/admin/analytics')) return Promise.resolve({ data: { trends: { propertiesByMonth: [] } } });
    if (url.endsWith('/api/admin/payment-periods')) return Promise.resolve({ data: [{ status: 'pending' }, { status: 'paid' }] });
    if (url.endsWith('/api/contact/platform-admin/inbox')) return Promise.resolve({ data: [{ read: false }, { read: true }] });
    if (url.includes('/api/admin/system-logs')) {
      return Promise.resolve({
        data: {
          logs: [
            { _id: 'log-1', action: 'USER_LOGIN', description: 'Routine login', createdAt: '2026-01-16T00:00:00.000Z' },
            { _id: 'log-2', action: 'PROPERTY_APPROVED', description: 'Property approved', createdAt: '2026-01-15T00:00:00.000Z' },
            { _id: 'log-3', action: 'USER_LOGOUT', description: 'Routine logout', createdAt: '2026-01-14T00:00:00.000Z' },
            { _id: 'log-4', action: 'PROPERTY_REJECTED', description: 'Property rejected', createdAt: '2026-01-13T00:00:00.000Z' },
            { _id: 'log-5', action: 'PROPERTY_CREATED', description: 'Property submitted', createdAt: '2026-01-12T00:00:00.000Z' },
            { _id: 'log-6', action: 'PAYMENT_CONFIRMED', description: 'Payment confirmed', createdAt: '2026-01-11T00:00:00.000Z' },
            { _id: 'log-7', action: 'USER_UPDATED', description: 'User updated', createdAt: '2026-01-10T00:00:00.000Z' },
          ],
        },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

test('platform dashboard shows linked stats, charts, pending properties, recent logs, and quick actions', async () => {
  renderDashboard();

  expect(screen.getByRole('heading', { name: 'Welcome back, Admin Example' })).toBeInTheDocument();
  expect(screen.getByText('Here is what is happening on the platform today.')).toBeInTheDocument();
  expect(document.querySelector('.dashboard-welcome-banner')).toHaveClass('bg-green-700');
  expect(screen.getByRole('time')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /Total Properties/ })).toHaveAttribute('href', '/admin-dashboard/all-properties');
  expect(await screen.findByRole('link', { name: /Total Users/ })).toHaveAttribute('href', '/admin-dashboard/all-users');
  expect(await screen.findByRole('link', { name: /Area Admins/ })).toHaveTextContent('3');
  expect(screen.getByRole('link', { name: /Platform Admin/ })).toHaveTextContent('1');
  expect(screen.getByRole('link', { name: /Pending Payments/ })).toHaveAttribute('href', '/admin-dashboard/payment-period');
  expect(screen.getByRole('link', { name: /Unread Contact Messages/ })).toHaveAttribute('href', '/admin-dashboard/contact-messages');
  expect(screen.getByRole('heading', { name: 'Properties by status' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'New properties per month' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Properties by status' })).toHaveTextContent('3');
  expect(screen.getByText('Other').closest('li')).toHaveTextContent('Other1');
  expect(await screen.findByText('Pending house')).toBeInTheDocument();
  expect(screen.getByText(/Owner: Property owner/)).toBeInTheDocument();
  expect(screen.getByText('Mekdela Amba · ETB 12,000')).toBeInTheDocument();
  expect(await screen.findByText('PROPERTY_APPROVED')).toBeInTheDocument();
  expect(screen.getByText('PROPERTY_REJECTED')).toBeInTheDocument();
  expect(screen.getByText('PROPERTY_CREATED')).toBeInTheDocument();
  expect(screen.getByText('PAYMENT_CONFIRMED')).toBeInTheDocument();
  expect(screen.getByText('USER_UPDATED')).toBeInTheDocument();
  expect(screen.queryByText('USER_LOGIN')).not.toBeInTheDocument();
  expect(screen.queryByText('USER_LOGOUT')).not.toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/admin/system-logs?limit=100'),
    expect.any(Object),
  );
  expect(screen.getByRole('link', { name: /Manage users/ })).toHaveAttribute('href', '/admin-dashboard/all-users');
  expect(screen.getByRole('link', { name: /View messages/ })).toHaveAttribute('href', '/admin-dashboard/contact-messages');
  expect(screen.getByRole('link', { name: /Review properties/ })).toHaveAttribute('href', '/admin-dashboard/review-properties');
});

test('area admin dashboard shows assigned area, scoped rental counts and area quick actions', async () => {
  useAuth.mockReturnValue({
    user: {
      role: 'admin',
      adminType: 'area',
      name: 'Area Admin',
      adminAreas: [{ region: 'Tigray', city: 'Mekelle' }],
    },
  });
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/admin/properties')) {
      return Promise.resolve({
        data: [{
          ...pendingProperty,
          createdAt: new Date().toISOString(),
        }],
      });
    }
    if (url.includes('/api/rental-requests/admin-requests')) {
      return Promise.resolve({
        data: [
          { _id: 'request-pending', status: 'pending' },
          { _id: 'request-approved', status: 'approved' },
          { _id: 'request-rejected', status: 'rejected' },
          { _id: 'request-confirmed', status: 'confirmed' },
        ],
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  renderDashboard();

  expect(screen.getByText('Area: Tigray, Mekelle - Here is what is happening in your area today.')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Rental requests' })).toBeInTheDocument();
  expect(getRentalCount('Pending')).toHaveTextContent('1');
  expect(getRentalCount('Approved')).toHaveTextContent('1');
  expect(getRentalCount('Rejected')).toHaveTextContent('1');
  expect(await screen.findByRole('link', { name: /Total Properties/ })).toHaveAttribute('href', '/admin-dashboard/all-properties');
  expect(screen.getByRole('link', { name: /Under Review/ })).toHaveAttribute('href', '/admin-dashboard/pending');
  expect(screen.getByRole('link', { name: /Verified Properties/ })).toHaveAttribute('href', '/admin-dashboard/verified');
  expect(screen.getByRole('link', { name: /Rejected Properties/ })).toHaveAttribute('href', '/admin-dashboard/rejected');
  expect(screen.getByRole('link', { name: /Rental requests/ })).toHaveAttribute('href', '/admin-dashboard/rental-requests');
  expect(screen.getByRole('link', { name: /Review properties/ })).toHaveAttribute('href', '/admin-dashboard/pending');
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/rental-requests/admin-requests'),
    expect.any(Object),
  );
  expect(document.querySelector('.admin-dashboard-month-chart')).toHaveAttribute('data-single-month', 'true');
});

test('recent activity fills remaining places with routine events when fewer than five meaningful logs exist', async () => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/admin/properties')) return Promise.resolve({ data: [] });
    if (url.endsWith('/api/admin/stats')) return Promise.resolve({ data: { totalUsers: 0 } });
    if (url.endsWith('/api/admin/analytics')) return Promise.resolve({ data: { trends: { propertiesByMonth: [] } } });
    if (url.endsWith('/api/admin/payment-periods')) return Promise.resolve({ data: [] });
    if (url.endsWith('/api/contact/platform-admin/inbox')) return Promise.resolve({ data: [] });
    if (url.includes('/api/admin/system-logs')) {
      return Promise.resolve({
        data: {
          logs: [
            { _id: 'routine-1', action: 'USER_LOGIN', description: 'Latest routine', createdAt: '2026-01-16T00:00:00.000Z' },
            { _id: 'meaningful-1', action: 'PROPERTY_APPROVED', description: 'Approved', createdAt: '2026-01-15T00:00:00.000Z' },
            { _id: 'routine-2', action: 'USER_LOGOUT', description: 'Next routine', createdAt: '2026-01-14T00:00:00.000Z' },
            { _id: 'meaningful-2', action: 'USER_UPDATED', description: 'Updated', createdAt: '2026-01-13T00:00:00.000Z' },
          ],
        },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  renderDashboard();
  const activityList = await screen.findByText('PROPERTY_APPROVED');
  expect(activityList.closest('ul')).toHaveTextContent('PROPERTY_APPROVED');
  expect(activityList.closest('ul')).toHaveTextContent('USER_UPDATED');
  expect(activityList.closest('ul')).toHaveTextContent('USER_LOGIN');
  expect(activityList.closest('ul')).toHaveTextContent('USER_LOGOUT');
});

test('area dashboard does not request platform-only data or expose platform-only links', async () => {
  useAuth.mockReturnValue({ user: { role: 'admin', adminType: 'area' } });
  axios.get.mockResolvedValue({ data: [pendingProperty] });

  renderDashboard();
  expect(await screen.findByText('Pending house')).toBeInTheDocument();

  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(axios.get.mock.calls[0][0]).toContain('/api/admin/properties');
  expect(axios.get.mock.calls[1][0]).toContain('/api/rental-requests/admin-requests');
  expect(screen.queryByRole('heading', { name: 'Recent activity' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Manage users/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/admin-dashboard/pending');
});
