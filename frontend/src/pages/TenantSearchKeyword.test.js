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

const expectKeywordSearch = async (keyword) => {
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
  const requestUrl = axios.get.mock.calls[0][0];
  expect(new URLSearchParams(requestUrl.split('?')[1]).get('search')).toBe(keyword);
};

describe('TenantSearch keyword submit controls', () => {
  beforeAll(() => {
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  beforeEach(() => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: [] });
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('submits the keyword when the right-side in-field search icon is clicked', async () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search properties...'), { target: { value: 'dess' } });
    const iconButton = screen.getByRole('button', { name: 'Search keyword' });
    expect(iconButton).toContainElement(document.querySelector('.tenant-keyword-search-input svg'));
    fireEvent.click(iconButton);

    await expectKeywordSearch('dess');
  });

  it('submits the keyword when Enter is pressed in the search field', async () => {
    renderSearch();
    const searchInput = screen.getByPlaceholderText('Search properties...');
    userEvent.type(searchInput, 'modern{enter}');

    await expectKeywordSearch('modern');
  });

  it('submits the keyword through the existing Search button', async () => {
    renderSearch();
    fireEvent.change(screen.getByPlaceholderText('Search properties...'), { target: { value: 'house' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));

    await expectKeywordSearch('house');
  });
});
