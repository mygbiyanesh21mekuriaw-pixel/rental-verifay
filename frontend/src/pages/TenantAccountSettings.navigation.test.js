import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LandlordAccountSettings from './LandlordAccountSettings';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

test('tenant account settings links back to the tenant dashboard', () => {
  useAuth.mockReturnValue({
    user: { role: 'tenant', name: 'Tenant', email: 'tenant@example.com' },
    updateUser: jest.fn(),
  });

  render(
    <MemoryRouter initialEntries={['/tenant/account-settings']}>
      <Routes>
        <Route path="/tenant-dashboard" element={<CurrentPath />} />
        <Route path="/tenant/account-settings" element={<LandlordAccountSettings />} />
      </Routes>
    </MemoryRouter>,
  );

  const backLink = screen.getByRole('link', { name: '← Back to Dashboard' });
  expect(backLink).toHaveAttribute('href', '/tenant-dashboard');
  fireEvent.click(backLink);

  expect(screen.getByTestId('current-path')).toHaveTextContent('/tenant-dashboard');
});
