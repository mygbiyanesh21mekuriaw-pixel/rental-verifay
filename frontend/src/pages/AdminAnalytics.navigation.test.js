import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminAnalytics from './AdminAnalytics';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

test('analytics links back to the platform admin dashboard', async () => {
  axios.get.mockResolvedValue({ data: {} });

  render(
    <MemoryRouter initialEntries={['/admin-dashboard/analytics']}>
      <Routes>
        <Route path="/admin-dashboard" element={<CurrentPath />} />
        <Route path="/admin-dashboard/analytics" element={<AdminAnalytics />} />
      </Routes>
    </MemoryRouter>,
  );

  const backLink = await screen.findByRole('link', { name: /back to dashboard/i });
  expect(backLink).toHaveAttribute('href', '/admin-dashboard');
  fireEvent.click(backLink);

  expect(screen.getByTestId('current-path')).toHaveTextContent('/admin-dashboard');
});
