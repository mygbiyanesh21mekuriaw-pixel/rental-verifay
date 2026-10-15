import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TenantRentalRequestDetail from './TenantRentalRequestDetail';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text) => text,
    formatDate: (date) => date.toLocaleDateString('en-US'),
    formatCurrency: (amount) => `ETB ${Number(amount).toLocaleString()}`,
  }),
}));

const rentalRequest = {
  _id: 'request-1',
  status: 'pending',
  createdAt: '2026-10-14T12:00:00.000Z',
  property: {
    title: 'Bole Home',
    location: 'Addis Ababa',
    price: 12000,
  },
  landlord: { name: 'Landlord Name' },
};

const renderDetail = (initialEntry) => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/tenant/rental-requests/:requestId" element={<TenantRentalRequestDetail />} />
      <Route path="/tenant/detail" element={<TenantRentalRequestDetail />} />
      <Route path="/tenant/rental-requests" element={<p>Rental Requests Page</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.setItem('token', 'tenant-token');
  axios.get.mockReset();
});

test('loads the requested rental-request details and returns to the requests list', async () => {
  axios.get.mockResolvedValue({ data: rentalRequest });
  renderDetail('/tenant/rental-requests/request-1');

  expect(await screen.findByRole('heading', { name: 'Rental Request Details' })).toBeInTheDocument();
  expect(screen.getByText('Bole Home')).toBeInTheDocument();
  expect(screen.getByText('Addis Ababa')).toBeInTheDocument();
  expect(screen.getByText('Landlord Name')).toBeInTheDocument();
  expect(screen.getByText('Pending')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/rent-requests/my-requests/request-1'),
    expect.any(Object),
  );

  fireEvent.click(screen.getByRole('link', { name: 'Back to Rental Requests' }));
  expect(await screen.findByText('Rental Requests Page')).toBeInTheDocument();
});

test('shows approval status and decision date without an empty admin response message', async () => {
  axios.get.mockResolvedValue({
    data: {
      ...rentalRequest,
      status: 'approved',
      reviewedAt: '2026-10-15T12:00:00.000Z',
      adminComment: '',
    },
  });
  renderDetail('/tenant/rental-requests/request-1');

  expect(await screen.findByText('Approved')).toBeInTheDocument();
  expect(screen.getByText('Admin Decision Date')).toBeInTheDocument();
  expect(screen.queryByText('Admin Response')).not.toBeInTheDocument();
  expect(screen.queryByText('No admin response provided.')).not.toBeInTheDocument();
});

test('shows a friendly missing-request state with a link back to requests', async () => {
  renderDetail('/tenant/detail');

  expect(await screen.findByRole('alert')).toHaveTextContent('Rental request not found.');
  expect(screen.getByRole('link', { name: 'Back to Rental Requests' }))
    .toHaveAttribute('href', '/tenant/rental-requests');
  expect(axios.get).not.toHaveBeenCalled();
});

test('shows load errors and returns to requests', async () => {
  axios.get.mockRejectedValue(new Error('Request could not be loaded.'));
  renderDetail('/tenant/rental-requests/request-1');

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load rental request.');
  fireEvent.click(screen.getByRole('link', { name: 'Back to Rental Requests' }));
  await waitFor(() => expect(screen.getByText('Rental Requests Page')).toBeInTheDocument());
});
