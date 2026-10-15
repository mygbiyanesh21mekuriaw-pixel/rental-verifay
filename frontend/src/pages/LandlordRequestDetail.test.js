import React from 'react';
import axios from 'axios';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandlordRequestDetail from './LandlordRequestDetail';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text) => text,
    formatDate: (date) => new Date(date).toLocaleDateString('en-US'),
    formatCurrency: (amount) => `ETB ${Number(amount).toLocaleString()}`,
  }),
}));

const request = {
  _id: 'request-1',
  status: 'approved',
  message: 'I am interested in renting this home.',
  createdAt: '2026-10-15T12:00:00.000Z',
  property: {
    title: 'Bole Apartment',
    location: 'Bole, Addis Ababa',
    price: 15000,
  },
  tenant: {
    name: 'Dawit Tenant',
    phone: '+251911123456',
    email: 'dawit@example.com',
  },
};

beforeEach(() => {
  localStorage.setItem('token', 'landlord-token');
  axios.get.mockReset().mockResolvedValue({ data: request });
});

test('presents landlord request details with status, tenant contact, and message', async () => {
  render(
    <MemoryRouter initialEntries={['/landlord/rental-requests/request-1']}>
      <Routes>
        <Route path="/landlord/rental-requests/:requestId" element={<LandlordRequestDetail />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: 'Bole Apartment' })).toBeInTheDocument();
  expect(screen.getByText('Approved')).toBeInTheDocument();
  expect(screen.getByText('ETB 15,000')).toBeInTheDocument();
  expect(screen.getByText('Bole, Addis Ababa')).toBeInTheDocument();
  expect(screen.getByText('Dawit Tenant')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '+251911123456' })).toHaveAttribute('href', 'tel:+251911123456');
  expect(screen.getByRole('link', { name: 'dawit@example.com' })).toHaveAttribute('href', 'mailto:dawit@example.com');
  expect(screen.getByText('I am interested in renting this home.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to Requests/ })).toHaveAttribute('href', '/landlord/rental-requests');
});
