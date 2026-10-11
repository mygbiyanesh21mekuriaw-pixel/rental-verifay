import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminSystemLogs from './AdminSystemLogs';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

test('system logs links back to the platform admin dashboard', async () => {
  axios.get.mockResolvedValue({
    data: {
      logs: [],
      pagination: {
        total: 0,
        page: 1,
        totalPages: 1,
        limit: 20,
        hasNextPage: false,
        hasPrevPage: false,
      },
    },
  });

  render(
    <MemoryRouter initialEntries={['/admin-dashboard/system-logs']}>
      <Routes>
        <Route path="/admin-dashboard" element={<CurrentPath />} />
        <Route path="/admin-dashboard/system-logs" element={<AdminSystemLogs />} />
      </Routes>
    </MemoryRouter>,
  );

  const backLink = await screen.findByRole('link', { name: /back to dashboard/i });
  expect(backLink).toHaveAttribute('href', '/admin-dashboard');
  fireEvent.click(backLink);

  expect(screen.getByTestId('current-path')).toHaveTextContent('/admin-dashboard');
});
