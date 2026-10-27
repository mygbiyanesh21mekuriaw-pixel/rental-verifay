import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LandlordAccountSettings from './LandlordAccountSettings';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { useLanguage } from '../context/LanguageContext';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../context/LanguageContext', () => ({
  useLanguage: jest.fn(),
}));
jest.mock('../components/ProfilePhotoControl', () => () => null);

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

test('tenant account settings links back to the tenant dashboard', async () => {
  useAuth.mockReturnValue({
    user: { role: 'tenant', name: 'Tenant', email: 'tenant@example.com' },
    updateUser: jest.fn(),
    loadUser: jest.fn(),
  });
  useLanguage.mockReturnValue({
    language: 'en',
    setLanguage: jest.fn(),
    t: (text) => text,
  });
  axios.get.mockResolvedValue({
    data: {
      role: 'tenant',
      name: 'Tenant',
      email: 'tenant@example.com',
      security: { recentSignIns: [] },
    },
  });

  render(
    <MemoryRouter initialEntries={['/tenant/account-settings']}>
      <Routes>
        <Route path="/tenant-dashboard" element={<CurrentPath />} />
        <Route path="/tenant/account-settings" element={<LandlordAccountSettings />} />
      </Routes>
    </MemoryRouter>,
  );

  const backLink = await screen.findByRole('link', { name: '← Back to Dashboard' });
  expect(backLink).toHaveAttribute('href', '/tenant-dashboard');
  fireEvent.click(backLink);

  expect(screen.getByTestId('current-path')).toHaveTextContent('/tenant-dashboard');
});
