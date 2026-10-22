import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPlaces from './AdminPlaces';
import { LanguageProvider } from '../context/LanguageContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

const place = { _id: 'place-1', name: 'North', region: 'Amhara' };

const renderPage = () => render(
  <LanguageProvider>
    <MemoryRouter>
      <AdminPlaces />
    </MemoryRouter>
  </LanguageProvider>,
);

beforeEach(() => {
  localStorage.setItem('token', 'platform-token');
  axios.get.mockReset().mockResolvedValue({ data: [place] });
  axios.post.mockReset().mockResolvedValue({ data: { message: 'Place added successfully.' } });
  axios.put.mockReset().mockResolvedValue({ data: { message: 'Place updated successfully.' } });
  axios.delete.mockReset().mockResolvedValue({ data: { message: 'Place deleted successfully.' } });
  window.confirm = jest.fn(() => true);
});

test('lists places and edits name and region', async () => {
  renderPage();

  expect(await screen.findByText('North')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith('/api/areas', {
    headers: { Authorization: 'Bearer platform-token' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByPlaceholderText('Place name'), { target: { value: 'South' } });
  fireEvent.change(screen.getByPlaceholderText('Region (optional)'), { target: { value: 'Oromia' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Place' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    '/api/areas/place-1',
    { name: 'South', region: 'Oromia' },
    { headers: { Authorization: 'Bearer platform-token' } },
  ));
  expect(await screen.findByRole('status')).toHaveTextContent('Place updated successfully.');
});

test('creates a place and displays a server error when names conflict', async () => {
  axios.post.mockRejectedValue({
    response: { status: 409, data: { message: 'A place with that name already exists.' } },
  });
  renderPage();
  await screen.findByText('North');

  fireEvent.change(screen.getByPlaceholderText('Place name'), { target: { value: 'north' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Place' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'HTTP 409: A place with that name already exists.',
  );
});

test('deletes a place after confirmation', async () => {
  renderPage();
  await screen.findByText('North');
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/areas/place-1', {
    headers: { Authorization: 'Bearer platform-token' },
  }));
  expect(await screen.findByRole('status')).toHaveTextContent('Place deleted successfully.');
});
