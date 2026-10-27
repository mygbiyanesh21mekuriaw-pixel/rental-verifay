import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import TenantSectionPage from './TenantSectionPage';
import { useAuth } from '../context/AuthContext';
import { fetchFavoriteIds, getFavoriteIds, toggleFavorite } from '../utils/favorites';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../utils/favorites', () => ({
  fetchFavoriteIds: jest.fn(),
  getFavoriteIds: jest.fn(),
  toggleFavorite: jest.fn(),
}));

const tenant = { id: 'tenant-1', role: 'tenant', name: 'Taylor Tenant' };
const activeRequest = (overrides = {}) => ({
  _id: 'request-1',
  status: 'approved',
  moveInDate: '2026-10-01T00:00:00.000Z',
  landlord: { name: 'Landlord Example' },
  property: {
    _id: 'property-1',
    title: 'Sunny Apartment',
    location: 'Bole, Addis Ababa',
    price: 8000,
    images: [],
    availabilityStatus: 'rented',
    rentedBy: tenant.id,
    rentedAt: '2026-10-01T00:00:00.000Z',
  },
  ...overrides,
});

const renderRentedPage = (requests) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/rent-requests/my-requests')) return Promise.resolve({ data: requests });
    if (url.includes('/api/notifications')) return Promise.resolve({ data: [] });
    if (url.includes('/api/reviews/my/')) return Promise.resolve({ data: { review: null } });
    return Promise.resolve({ data: [] });
  });

  return render(
    <MemoryRouter initialEntries={['/tenant/rented-property']}>
      <Routes>
        <Route path="/tenant/rented-property" element={<TenantSectionPage type="rented" />} />
        <Route path="/tenant/rent-payment/:propertyId" element={<div>Payment destination</div>} />
        <Route path="/tenant/messages" element={<MessageDestination />} />
      </Routes>
    </MemoryRouter>,
  );
};

const MessageDestination = () => {
  const location = useLocation();
  return <div data-testid="message-destination">{location.search}</div>;
};

beforeEach(() => {
  localStorage.setItem('token', 'tenant-token');
  window.scrollTo = jest.fn();
  useAuth.mockReturnValue({ user: tenant });
  fetchFavoriteIds.mockResolvedValue(new Set());
  getFavoriteIds.mockReturnValue(new Set());
  toggleFavorite.mockReset();
  axios.get.mockReset();
  axios.post.mockReset().mockResolvedValue({ data: { _id: 'conversation-1' } });
});

test('rented properties show the modern rental details and preserve existing actions', async () => {
  renderRentedPage([
    activeRequest({
      is_new: true,
      is_new_until: new Date(Date.now() + 60_000).toISOString(),
    }),
    activeRequest({
      _id: 'request-2',
      property: {
        ...activeRequest().property,
        _id: 'property-2',
        title: 'Garden House',
      },
    }),
  ]);

  expect(await screen.findByRole('heading', { name: 'Sunny Apartment' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Garden House' })).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getAllByText('Active Rental')).toHaveLength(2);
  expect(screen.getAllByText('New')).toHaveLength(1);
  expect(screen.getAllByText('ETB 8,000')).toHaveLength(4);
  expect(screen.getAllByText('This property has been rented in your name.')).toHaveLength(2);
  expect(await screen.findAllByRole('button', { name: 'Write a review' })).toHaveLength(2);

  fireEvent.click(screen.getAllByRole('button', { name: 'Write a review' })[0]);
  expect(screen.getByLabelText('Your review')).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Pay Rent' })[0]);
  expect(await screen.findByText('Payment destination')).toBeInTheDocument();
});

test('Message Landlord opens the existing conversation and empty rentals link to properties', async () => {
  renderRentedPage([activeRequest()]);

  fireEvent.click(await screen.findByRole('button', { name: 'Message Landlord' }));
  expect(await screen.findByTestId('message-destination')).toHaveTextContent('?conversationId=conversation-1');
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/messages/conversations/open'),
    { propertyId: 'property-1' },
    expect.any(Object),
  );
});

test('rented property empty state provides a browse-properties link', async () => {
  renderRentedPage([]);

  expect(await screen.findByText('You do not have an approved rented property yet.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Browse Properties' })).toHaveAttribute(
    'href',
    '/tenant/verified-properties',
  );
});

test('verified property cards retain favorite and request actions with the new card layout', async () => {
  const property = {
    _id: 'property-verified',
    title: 'A very long verified property title that should stay on one line',
    description: 'A long property description that should be visually clamped after two lines.',
    location: 'Bole, Addis Ababa',
    price: 12000,
    bedrooms: 3,
    landlord: { role: 'landlord', name: 'Landlord Example' },
    isVerified: true,
    verificationStatus: 'approved',
    availabilityStatus: 'available',
    images: [],
  };
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/favorites')) return Promise.resolve({ data: [] });
    if (url.includes('/api/properties?')) return Promise.resolve({ data: [property] });
    return Promise.resolve({ data: [] });
  });
  toggleFavorite.mockResolvedValue(true);

  render(
    <MemoryRouter>
      <TenantSectionPage type="verified" />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Verified')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: property.title })).toHaveTextContent('No photo');
  expect(screen.queryByText('Verification status: Approved')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Request to Rent' })).toHaveAttribute(
    'href',
    '/property/property-verified',
  );
  const favoriteButton = await screen.findByRole('button', { name: 'Favorite' });
  await waitFor(() => expect(favoriteButton).toBeEnabled());
  fireEvent.click(favoriteButton);
  expect(toggleFavorite).toHaveBeenCalledWith(
    tenant.id,
    property._id,
    'tenant-token',
  );
  expect(await screen.findByRole('button', { name: 'Favorited' })).toBeInTheDocument();
});

test('favorite property cards remove favorites and use singular room text', async () => {
  const property = {
    _id: 'property-favorite',
    title: 'Favorite Apartment',
    description: 'A saved rental property.',
    location: 'Bole, Addis Ababa',
    price: 9000,
    bedrooms: 1,
    landlord: { role: 'landlord', name: 'Landlord Example' },
    isVerified: true,
    verificationStatus: 'approved',
    availabilityStatus: 'available',
    images: [],
  };
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/favorites')) return Promise.resolve({ data: [property] });
    return Promise.resolve({ data: [] });
  });
  toggleFavorite.mockResolvedValue(false);

  render(
    <MemoryRouter>
      <TenantSectionPage type="favorites" />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: property.title })).toBeInTheDocument();
  expect(screen.getByText('1 room')).toBeInTheDocument();
  expect(screen.queryByText('1 rooms')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Request to Rent' })).toHaveAttribute(
    'href',
    '/property/property-favorite',
  );
  const removeFavoriteButton = await screen.findByRole('button', { name: 'Remove from favorites' });
  await waitFor(() => expect(removeFavoriteButton).toBeEnabled());
  expect(removeFavoriteButton).toHaveAttribute('title', 'Remove from favorites');
  fireEvent.click(removeFavoriteButton);

  expect(toggleFavorite).toHaveBeenCalledWith(
    tenant.id,
    property._id,
    'tenant-token',
  );
  expect(await screen.findByText('You have no favorite properties yet')).toBeInTheDocument();
});

test('favorite empty state keeps its message and links to verified properties', async () => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/api/favorites')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });

  render(
    <MemoryRouter>
      <TenantSectionPage type="favorites" />
    </MemoryRouter>,
  );

  expect(await screen.findByText('You have no favorite properties yet')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Browse Verified Properties' })).toHaveAttribute(
    'href',
    '/tenant/verified-properties',
  );
});
