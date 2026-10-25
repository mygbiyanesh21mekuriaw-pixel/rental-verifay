import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ChangePassword from './ChangePassword';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (text) => text }) }));

const user = { role: 'admin', adminType: 'area', mustChangePassword: true };
const updateUser = jest.fn();

const renderChangePage = () => render(
  <MemoryRouter initialEntries={['/change-password']}>
    <Routes>
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/admin-dashboard" element={<h1>Admin Dashboard</h1>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  axios.post.mockReset().mockResolvedValue({ data: { message: 'Password changed successfully.' } });
  updateUser.mockReset();
  useAuth.mockReturnValue({ user, updateUser });
});

test('validates length and matching confirmation before calling the API', () => {
  renderChangePage();
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters.');
  expect(axios.post).not.toHaveBeenCalled();
});

test('posts only the new password, clears auth flag, and navigates to dashboard', async () => {
  renderChangePage();
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'permanent-password' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'permanent-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/change-password$/),
    { newPassword: 'permanent-password' },
  ));
  expect(updateUser).toHaveBeenCalledWith({ ...user, mustChangePassword: false });
  expect(await screen.findByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument();
});

test('supports show and hide for password inputs', () => {
  renderChangePage();
  const newPassword = screen.getByLabelText('New Password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(newPassword).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(newPassword).toHaveAttribute('type', 'password');
});