import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LandlordLayout } from './LandlordDashboard';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'landlord-1', role: 'landlord', name: 'Landlord Example' },
    logout: jest.fn(),
  }),
}));
jest.mock('../components/LanguageSwitcher', () => () => null);

const landlordPages = [
  ['/landlord/add-property', 'Add House'],
  ['/landlord/my-properties', 'My Properties'],
  ['/landlord/verified-properties', 'Verified Properties'],
  ['/landlord/rental-requests', 'Rental Requests'],
  ['/landlord/rented-properties', 'Rented Properties'],
  ['/landlord/under-review', 'Under Review'],
  ['/landlord/rejected', 'Rejected'],
  ['/landlord/rent-payments', 'Rent Payments'],
  ['/landlord/bank-information', 'Bank Information'],
  ['/landlord/account-settings', 'Account Settings'],
];

const LayoutRoute = () => {
  const location = useLocation();
  return (
    <LandlordLayout>
      <output data-testid="current-route">{location.pathname}</output>
    </LandlordLayout>
  );
};

test.each(landlordPages)(
  '%s displays a Back to Dashboard link and keeps the sidebar after navigation',
  (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<LayoutRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const backLink = screen.getByRole('link', { name: '← Back to Dashboard' });
    expect(backLink).toHaveAttribute('href', '/landlord-dashboard');
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    fireEvent.click(backLink);

    expect(screen.getByTestId('current-route')).toHaveTextContent('/landlord-dashboard');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  }
);

test('does not add the link to the Landlord Dashboard itself', () => {
  render(
    <MemoryRouter initialEntries={['/landlord-dashboard']}>
      <Routes>
        <Route path="*" element={<LayoutRoute />} />
      </Routes>
    </MemoryRouter>
  );

  expect(screen.queryByRole('link', { name: '← Back to Dashboard' }))
    .not.toBeInTheDocument();
});
