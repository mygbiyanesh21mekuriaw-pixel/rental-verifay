import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import TenantSearch from './TenantSearch';

jest.mock('axios');
jest.mock('react-leaflet', () => ({
  MapContainer: () => null,
  Marker: () => null,
  Popup: () => null,
  TileLayer: () => null,
  useMap: () => ({ flyTo: jest.fn() }),
}));
jest.mock('leaflet', () => ({ divIcon: jest.fn() }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'tenant-1' } }),
}));
jest.mock('../components/BackToDashboard', () => () => null);

const renderSearch = () => render(
  <MemoryRouter>
    <TenantSearch />
  </MemoryRouter>
);

const expectFilterSearch = async (field, value) => {
  let requestUrl;
  await waitFor(() => {
    const propertyRequest = axios.get.mock.calls.find(([url]) => url.includes('/api/properties?'));
    expect(propertyRequest).toBeDefined();
    requestUrl = propertyRequest[0];
  });
  expect(new URLSearchParams(requestUrl.split('?')[1]).get(field)).toBe(value);
};

describe('TenantSearch filter controls', () => {
  beforeAll(() => {
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  beforeEach(() => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: [] });
    axios.post.mockReset();
    axios.post.mockResolvedValue({ data: { isFavorite: true } });
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('removes the duplicate keyword search field', () => {
    renderSearch();

    expect(screen.queryByPlaceholderText('Search properties...')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();
  });

  it('submits the Title filter when Enter is pressed', async () => {
    renderSearch();
    userEvent.type(screen.getByPlaceholderText('Title'), 'modern{enter}');

    await expectFilterSearch('title', 'modern');
  });

  it('submits the Title filter through the existing Search button', async () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'house' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));

    await expectFilterSearch('title', 'house');
  });

  it('shows search icons on the requested filters, but not Address', () => {
    renderSearch();

    const searchableFields = [
      'Title',
      'Description',
      'Bedrooms',
      'Price',
      'Region',
      'Zone',
      'Wereda',
      'City',
      'Sub-city',
      'Kebele',
      'House Number',
    ];
    searchableFields.forEach((field) => {
      expect(screen.getByRole('button', { name: `Search by ${field}` })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Search by Address' })).not.toBeInTheDocument();
  });

  it('groups the same address fields used by the landlord Add House form', () => {
    renderSearch();
    const addressGroup = screen.getByRole('group', { name: 'Address' });

    expect(screen.queryByPlaceholderText('Address')).not.toBeInTheDocument();
    ['Region', 'Zone', 'Wereda', 'City', 'Sub-city', 'Kebele', 'House Number'].forEach((field) => {
      expect(addressGroup).toContainElement(screen.getByPlaceholderText(field));
    });
  });

  it('submits the corresponding filters when a field search icon is clicked', async () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Region'), { target: { value: 'Oromia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search by Region' }));

    await expectFilterSearch('region', 'Oromia');
  });

  it('displays matching properties after clicking a field search icon', async () => {
    const property = {
        _id: 'property-1',
        landlord: { role: 'landlord' },
        isVerified: true,
        verificationStatus: 'approved',
        availabilityStatus: 'available',
        title: 'Modern Apartment',
        description: 'Bright apartment',
        location: 'Addis Ababa',
        price: 12000,
        bedrooms: 2,
    };
    axios.get.mockImplementation((url) => Promise.resolve({
      data: url.includes('/api/favorites') ? [] : [property],
    }));
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Modern' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search by Title' }));

    await expectFilterSearch('title', 'Modern');
    expect(await screen.findByText(/Found 1 property/i)).toBeInTheDocument();
    const favoriteButton = screen.getByRole('button', { name: 'Favorite' });
    const requestLink = screen.getByRole('link', { name: 'Request to Rent' });
    expect(favoriteButton.closest('.tenant-card-actions')).toBe(requestLink.closest('.tenant-card-actions'));
    expect(favoriteButton).toHaveClass('tenant-card-action');
    expect(requestLink).toHaveClass('tenant-card-action');
  });

  it('saves a favorite to the API and updates the button only after success', async () => {
    const property = {
      _id: 'property-1',
      landlord: { role: 'landlord' },
      isVerified: true,
      verificationStatus: 'approved',
      availabilityStatus: 'available',
      title: 'Modern Apartment',
      description: 'Bright apartment',
      location: 'Addis Ababa',
      price: 12000,
      bedrooms: 2,
    };
    axios.get.mockImplementation((url) => Promise.resolve({
      data: url.includes('/api/favorites') ? [] : [property],
    }));
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Modern' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search by Title' }));

    const favoriteButton = await screen.findByRole('button', { name: 'Favorite' });
    fireEvent.click(favoriteButton);

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/favorites/toggle'),
      { propertyId: 'property-1' },
      expect.objectContaining({ headers: expect.any(Object) })
    ));
    expect(await screen.findByRole('button', { name: 'Favorited' })).toBeInTheDocument();
  });

  it('shows a clear error and disables Favorite when saved favorites cannot be loaded', async () => {
    const property = {
      _id: 'property-1',
      landlord: { role: 'landlord' },
      isVerified: true,
      verificationStatus: 'approved',
      availabilityStatus: 'available',
      title: 'Modern Apartment',
      description: 'Bright apartment',
      location: 'Addis Ababa',
      price: 12000,
      bedrooms: 2,
    };
    axios.get.mockImplementation((url) => (
      url.includes('/api/favorites')
        ? Promise.reject(new Error('Favorites unavailable'))
        : Promise.resolve({ data: [property] })
    ));
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));

    const favoriteButton = await screen.findByRole('button', { name: 'Favorite unavailable' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Unable to load saved favorites/i);
    expect(favoriteButton).toBeDisabled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('keeps Favorite unchanged and shows an error when the save request fails', async () => {
    const property = {
      _id: 'property-1',
      landlord: { role: 'landlord' },
      isVerified: true,
      verificationStatus: 'approved',
      availabilityStatus: 'available',
      title: 'Modern Apartment',
      description: 'Bright apartment',
      location: 'Addis Ababa',
      price: 12000,
      bedrooms: 2,
    };
    axios.get.mockImplementation((url) => Promise.resolve({
      data: url.includes('/api/favorites') ? [] : [property],
    }));
    axios.post.mockRejectedValue({
      response: { data: { message: 'Favorite update failed.' } },
    });
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Modern' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search by Title' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Favorite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Favorite update failed.');
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Favorited' })).not.toBeInTheDocument();
  });

  it('submits a property filter through the main Search button', async () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Region'), { target: { value: 'Oromia' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));

    await expectFilterSearch('region', 'Oromia');
  });
});
