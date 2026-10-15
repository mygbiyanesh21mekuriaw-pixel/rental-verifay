import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminAnalytics, { fillTrendMonths } from './AdminAnalytics';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (value) => value }),
}));

const analyticsResponse = {
  totals: {
    totalUsers: 8,
    totalProperties: 46,
    verifiedProperties: 19,
    pendingProperties: 20,
    rejectedProperties: 2,
    otherPropertyStatus: 5,
    totalAdmins: 4,
    totalAreaAdmins: 3,
    totalPlatformAdmins: 1,
    totalRentalRequests: 30,
    pendingRentalRequests: 10,
    approvedRentalRequests: 8,
    rejectedRentalRequests: 8,
    confirmedRentalRequests: 2,
    expiredRentalRequests: 1,
    otherRentalRequests: 1,
  },
  propertyStatus: {
    verified: 19,
    pending: 20,
    rejected: 2,
    other: 5,
    available: 35,
    rented: 10,
    otherAvailability: 1,
    breakdown: { approved: 19, pending: 20, rejected: 2, needs_documents: 5 },
    availabilityBreakdown: { available: 35, rented: 10, reserved: 1 },
  },
  userRoles: {
    total: 8,
    tenants: 2,
    landlords: 2,
    admins: 4,
    areaAdmins: 3,
    platformAdmins: 1,
  },
  rentalRequestStatus: {
    pending: 10,
    approved: 8,
    rejected: 8,
    confirmed: 2,
    expired: 1,
    other: 1,
  },
  trends: {
    propertiesByMonth: [
      { key: '2025-08', label: 'Aug 2025', value: 3 },
      { key: '2025-10', label: 'Oct 2025', value: 5 },
    ],
    usersByMonth: [{ key: '2025-12', label: 'Dec 2025', value: 2 }],
    rentalRequestsByMonth: [
      { key: '2025-08', label: 'Aug 2025', value: 1 },
      { key: '2025-10', label: 'Oct 2025', value: 4 },
    ],
  },
};

beforeEach(() => {
  localStorage.setItem('token', 'analytics-token');
  axios.get.mockReset().mockResolvedValue({ data: analyticsResponse });
});

const getStatCard = (label) => Array.from(document.querySelectorAll('.admin-analytics-stat-card'))
  .find((card) => card.querySelector('.admin-analytics-stat-label')?.textContent === label);
const getLegendItem = (label) => Array.from(document.querySelectorAll('.admin-donut-legend-item'))
  .find((item) => item.querySelector('span:nth-child(2)')?.textContent === label);

test('growth trends sort by year-month and fill zero months, capped at the latest 12', () => {
  const series = fillTrendMonths([
    { key: '2025-10', value: 4 },
    { key: '2025-08', value: 1 },
    { key: '2024-09', value: 8 },
  ], new Date(2025, 0, 20), 12);

  expect(series).toEqual([
    { key: '2024-09', label: 'Sep 2024', value: 8 },
    { key: '2024-10', label: 'Oct 2024', value: 0 },
    { key: '2024-11', label: 'Nov 2024', value: 0 },
    { key: '2024-12', label: 'Dec 2024', value: 0 },
    { key: '2025-01', label: 'Jan 2025', value: 0 },
  ]);
});

test('analytics splits admin counts, shows real status labels and filters by range', async () => {
  render(
    <MemoryRouter>
      <AdminAnalytics />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: 'Verification status' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Availability' })).toBeInTheDocument();
  expect(getStatCard('Area Admins')).toHaveTextContent('3');
  expect(getStatCard('Platform Admin')).toHaveTextContent('1');
  expect(getStatCard('Other Properties')).toBeUndefined();
  expect(screen.getByText('Needs Documents', { selector: '.admin-chart-bar-label' })).toBeInTheDocument();
  expect(screen.getByText('Reserved', { selector: '.admin-chart-bar-label' })).toBeInTheDocument();
  expect(screen.queryByText('Other Availability')).not.toBeInTheDocument();
  expect(getLegendItem('Area Admins')).toHaveTextContent('3');
  expect(getLegendItem('Platform Admin')).toHaveTextContent('1');
  const userRoleValues = Array.from(document.querySelectorAll('.admin-donut-legend-item strong'))
    .map((node) => Number(node.textContent.replace(/,/g, '')));
  expect(userRoleValues.reduce((sum, value) => sum + value, 0)).toBe(8);
  expect(getStatCard('Other Requests')).toHaveTextContent('1');
  expect(getStatCard('Approval rate')).toHaveTextContent('26.7%');
  expect(screen.getAllByText('Under Review').length).toBeGreaterThan(0);
  expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/analytics\?range=all&timezone=/),
    expect.any(Object),
  );

  fireEvent.change(screen.getByLabelText('Date range'), { target: { value: '30d' } });
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/api\/admin\/analytics\?range=30d&timezone=/),
    expect.any(Object),
  ));
  await screen.findAllByText('Rejected', { selector: '.admin-chart-bar-label' });

  const redFills = screen.getAllByText('Rejected', { selector: '.admin-chart-bar-label' })
    .map((label) => label.closest('.admin-chart-bar-group').querySelector('.admin-chart-bar-fill'));
  redFills.forEach((fill) => expect(fill).toHaveStyle({ background: '#ef4444' }));
  const blueFill = screen.getByText('Available', { selector: '.admin-chart-bar-label' }).closest('.admin-chart-bar-group').querySelector('.admin-chart-bar-fill');
  expect(blueFill).toHaveStyle({ background: '#2563eb' });
  const purpleFill = screen.getByText('Rented', { selector: '.admin-chart-bar-label' }).closest('.admin-chart-bar-group').querySelector('.admin-chart-bar-fill');
  expect(purpleFill).toHaveStyle({ background: '#7c3aed' });
});
