import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminSectionPage from './AdminSectionPage';
import PropertyDetail from './PropertyDetail';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text) => text,
    formatDate: (date) => new Date(date).toISOString(),
  }),
}));

const areaAdmin = { _id: 'area-admin-id', role: 'admin', adminType: 'area' };
const property = {
  _id: 'property-id',
  title: 'Test Property',
  verificationStatus: 'pending',
  isVerified: false,
};
const originalFetch = global.fetch;

const CurrentLocation = () => {
  const location = useLocation();
  return (
    <div data-testid="current-location">
      {JSON.stringify({
        url: `${location.pathname}${location.search}`,
        state: location.state,
      })}
    </div>
  );
};

beforeEach(() => {
  localStorage.setItem('token', 'area-admin-token');
  localStorage.removeItem('admin-properties-view');
  useAuth.mockReturnValue({ user: areaAdmin });
  axios.get.mockReset().mockImplementation((url) => {
    if (url.includes('/api/properties/property-id')) {
      return Promise.resolve({ data: property });
    }
    if (url.includes('/api/reviews/property/property-id')) {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({ data: [property] });
  });
  axios.delete.mockReset();
});

test.each([
  ['pending', '/admin-dashboard/pending'],
  ['verified', '/admin-dashboard/verified'],
])(
  'returns from property details to the originating %s listing and preserves its query',
  async (type, route) => {
    const originatingUrl = `${route}?search=central&page=2&status=available`;
    const originatingState = { selectedFilter: 'approved-only' };
    render(
      <MemoryRouter initialEntries={[{
        pathname: route,
        search: '?search=central&page=2&status=available',
        state: originatingState,
      }]}>
        <Routes>
          <Route path={route} element={<AdminSectionPage type={type} />} />
          <Route path="/property/:id" element={<PropertyDetail />} />
        </Routes>
        <CurrentLocation />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: /view details/i }));
    fireEvent.click(await screen.findByRole('button', { name: /back to previous/i }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(JSON.stringify({
      url: originatingUrl,
      state: originatingState,
    }));
  },
);

test('All Properties opens full details and only requests proof after the details view opens', async () => {
  const details = {
    ...property,
    description: 'Full private description',
    location: '12 Main Road',
    city: 'Mekelle',
    area: 'Mekelle',
    history: [],
    hasVerificationDocument: true,
    landlord: { name: 'Owner Example' },
  };
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/admin/properties?')) {
      return Promise.resolve({
        data: {
          properties: [property],
          totals: { total: 1, verified: 0, underReview: 1, rejected: 0 },
          areas: ['Mekelle'],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        },
      });
    }
    if (url.includes('/api/admin/properties/property-id/details')) {
      return Promise.resolve({ data: details });
    }
    return Promise.resolve({ data: [] });
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

  render(
    <MemoryRouter initialEntries={['/admin-dashboard/all-properties']}>
      <AdminSectionPage type="allProperties" />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: 'Test Property' })).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  expect(localStorage.getItem('admin-properties-view')).toBe('list');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search properties' }), { target: { value: 'house' } });
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('q=house'),
    expect.any(Object),
  ));
  fireEvent.click(screen.getAllByRole('button', { name: 'View details' })[0]);
  expect(await screen.findByText('Full private description')).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/properties/property-id/ownership-proof'),
    expect.any(Object),
  ));
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('Area Admin property details displays handling history with the original name and former-admin label', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/properties/property-id/history')) {
      return Promise.resolve({
        data: [{
          action: 'verified',
          byId: 'former-admin-id',
          byName: 'Admin A',
          isFormerAdmin: true,
          at: '2026-01-02T10:00:00.000Z',
          note: 'Documents checked',
        }],
      });
    }
    if (url.endsWith('/api/properties/property-id')) {
      return Promise.resolve({ data: { ...property, verificationStatus: 'approved', isVerified: true } });
    }
    return Promise.resolve({ data: [] });
  });

  render(
    <MemoryRouter initialEntries={['/property/property-id']}>
      <Routes>
        <Route path="/property/:id" element={<PropertyDetail />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
  expect(await screen.findByText(/Admin A/)).toBeInTheDocument();
  expect(screen.getByText(/Admin A \(former admin\)/)).toBeInTheDocument();
  expect(screen.getByText(/Documents checked/)).toBeInTheDocument();
});

test.each([
  ['pending', false, '/admin-dashboard/pending'],
  ['approved', true, '/admin-dashboard/verified'],
  ['rejected', false, '/admin-dashboard/all-properties'],
])(
  'direct property detail entry for %s falls back to its matching listing',
  async (verificationStatus, isVerified, expectedRoute) => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/properties/property-id')) {
        return Promise.resolve({
          data: { ...property, verificationStatus, isVerified },
        });
      }
      if (url.includes('/api/reviews/property/property-id')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter initialEntries={['/property/property-id']}>
        <Routes>
          <Route path="/property/:id" element={<PropertyDetail />} />
          <Route path="/admin-dashboard/:section" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /back to previous/i }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(expectedRoute);
  },
);
