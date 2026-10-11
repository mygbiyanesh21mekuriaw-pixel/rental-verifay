import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen } from '@testing-library/react';
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

const areaAdmin = { _id: 'area-admin-id', role: 'admin', adminType: 'area' };
const property = {
  _id: 'property-id',
  title: 'Test Property',
  verificationStatus: 'pending',
  isVerified: false,
};

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
  ['allProperties', '/admin-dashboard/all-properties'],
])(
  'returns from property details to the originating %s listing and preserves its query',
  async (type, route) => {
    const originatingUrl = `${route}?search=central&page=2&status=available`;
    const originatingState = { selectedFilter: 'approved-only' };
    render(
      <MemoryRouter initialEntries={[{ pathname: originatingUrl, state: originatingState }]}>
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
