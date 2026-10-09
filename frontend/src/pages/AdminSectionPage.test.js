import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminSectionPage from './AdminSectionPage';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const platformAdmin = {
  _id: 'platform-admin-id',
  name: 'Platform Admin',
  role: 'admin',
  adminType: 'platform',
};

const users = [
  {
    _id: 'tenant-id',
    name: 'Tenant Example',
    email: 'tenant@example.com',
    role: 'tenant',
  },
  platformAdmin,
];

const renderUsersPage = () => render(
  <MemoryRouter>
    <AdminSectionPage type="allUsers" />
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.setItem('token', 'platform-token');
  axios.get.mockReset().mockResolvedValue({ data: users });
  axios.delete.mockReset().mockResolvedValue({ data: { message: 'User deleted successfully' } });
  useAuth.mockReturnValue({ user: platformAdmin });
  window.confirm = jest.fn(() => true);
});

test('platform admin can delete another user after confirmation', async () => {
  renderUsersPage();

  const deleteButton = await screen.findByRole('button', { name: 'Delete Tenant Example' });
  expect(deleteButton).toHaveTextContent('');
  expect(deleteButton).toHaveAttribute('title', 'Delete user');
  expect(screen.queryByRole('button', { name: 'Delete Platform Admin' })).not.toBeInTheDocument();

  fireEvent.click(deleteButton);

  expect(window.confirm).toHaveBeenCalledWith(
    'Delete Tenant Example (tenant@example.com)? This action cannot be undone.',
  );
  await waitFor(() => {
    expect(axios.delete).toHaveBeenCalledWith(
      `${process.env.REACT_APP_API_URL}/api/admin/users/tenant-id`,
      { headers: { Authorization: 'Bearer platform-token' } },
    );
  });
  expect(await screen.findByRole('status')).toHaveTextContent('User deleted successfully');
  expect(screen.queryByText('tenant@example.com')).not.toBeInTheDocument();
});

test('cancelling user deletion does not call the API', async () => {
  window.confirm.mockReturnValue(false);
  renderUsersPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Delete Tenant Example' }));

  expect(axios.delete).not.toHaveBeenCalled();
  expect(screen.getByText('tenant@example.com')).toBeInTheDocument();
});

test('shows an error when the API rejects user deletion', async () => {
  axios.delete.mockRejectedValue({
    response: { data: { message: 'User cannot be deleted' } },
  });
  renderUsersPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Delete Tenant Example' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('User cannot be deleted');
  expect(screen.getByText('tenant@example.com')).toBeInTheDocument();
});
