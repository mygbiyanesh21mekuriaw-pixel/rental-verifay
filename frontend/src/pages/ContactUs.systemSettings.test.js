import React from 'react';
import { render, screen } from '@testing-library/react';
import Contact from './ContactUs';

jest.mock('../context/SystemStatusContext', () => ({
  useSystemStatus: () => ({
    status: {
      branding: {
        websiteName: 'RentalVerify Portal',
        contactEmail: 'support@example.com',
        contactPhone: '+251 911 123456',
        contactAddress: 'Addis Ababa',
      },
    },
  }),
}));

test('displays the configured website name and contact information', () => {
  render(<Contact />);

  expect(screen.getByText('Addis Ababa')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'support@example.com' })).toHaveAttribute(
    'href',
    'mailto:support@example.com',
  );
  expect(screen.getByRole('link', { name: '+251 911 123456' })).toHaveAttribute(
    'href',
    'tel:+251 911 123456',
  );
  expect(screen.getByText(/RentalVerify Portal is an academic student project/)).toBeInTheDocument();
});
