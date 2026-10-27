import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import AccountSettings from './AccountSettings';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));
jest.mock('../components/BackToDashboard', () => () => null);
jest.mock('../components/ProfilePhotoControl', () => () => <div data-testid="photo-control" />);

const createAccount = (overrides = {}) => ({
  id: 'user-id',
  name: 'Account User',
  email: 'account@example.com',
  phone: '',
  role: 'tenant',
  ...overrides,
});

const setup = (account = createAccount(), responseOverrides = {}) => {
  const loadUser = jest.fn();
  const updateUser = jest.fn();
  useAuth.mockReturnValue({ user: account, updateUser, loadUser });
  useLanguage.mockReturnValue({
    language: 'en',
    setLanguage: jest.fn(),
    t: (text) => text,
  });
  axios.get.mockResolvedValue({
    data: {
      ...account,
      security: {
        lastLoginAt: '2025-03-03T10:00:00.000Z',
        lastPasswordChangeAt: '2025-02-01T10:00:00.000Z',
        recentSignIns: [{ at: '2025-03-03T10:00:00.000Z', userAgent: 'Chrome/123' }],
      },
      systemPreferences: { notifications: { inAppEnabled: true, emailEnabled: false } },
      ...responseOverrides,
    },
  });
  return { loadUser, updateUser };
};

afterEach(() => {
  jest.clearAllMocks();
});

test.each([
  ['platform admin', createAccount({ role: 'admin', adminType: 'platform' }), 'Platform Admin'],
  ['area admin', createAccount({ role: 'admin', adminType: 'area', area: 'Dessie' }), 'Area Admin'],
  ['landlord', createAccount({ role: 'landlord' }), 'Landlord'],
  ['tenant', createAccount({ role: 'tenant' }), 'Tenant'],
])('shows the shared profile header and role for %s', async (_label, account, roleLabel) => {
  setup(account);
  render(<AccountSettings />);

  expect(await screen.findByRole('heading', { name: 'Account Settings' })).toBeInTheDocument();
  expect(screen.getByTestId('photo-control')).toBeInTheDocument();
  expect(screen.getAllByText(roleLabel)).toHaveLength(1);
  expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
});

test('shows editable language and platform-managed notification defaults in Preferences', async () => {
  setup();
  render(<AccountSettings />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Preferences' }));

  expect(screen.getByLabelText('Display language')).toBeInTheDocument();
  expect(screen.getByLabelText('Enable in-app notifications')).toBeDisabled();
  expect(screen.getByLabelText('Enable email notifications')).toBeDisabled();
  expect(screen.getByLabelText('Enable email notifications')).not.toBeChecked();
});

test('security tab shows account dates and recent sign-ins and rejects reusing the password', async () => {
  setup();
  render(<AccountSettings />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Security' }));

  expect(screen.getByText('Last password change')).toBeInTheDocument();
  expect(screen.getByText('Last login')).toBeInTheDocument();
  expect(screen.getByText('Chrome · Desktop device')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

  const dialog = screen.getByRole('dialog');
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'same-password' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'same-password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'same-password' } });
  fireEvent.submit(dialog.querySelector('form'));

  expect(screen.getAllByText('New password must be different from the current password.').length).toBeGreaterThan(0);
  expect(axios.put).not.toHaveBeenCalled();
});

test('profile editor validates the Ethiopian phone format and does not send invalid data', async () => {
  setup();
  render(<AccountSettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: '0712345678' } });
  fireEvent.submit(dialog.querySelector('form'));

  expect(screen.getAllByText('Use 09XXXXXXXX or +2519XXXXXXXX.').length).toBeGreaterThan(0);
  expect(axios.put).not.toHaveBeenCalled();
});

test('email editing prompts for the current password', async () => {
  setup();
  render(<AccountSettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'updated@example.com' } });

  expect(screen.getByLabelText('Current password')).toBeInTheDocument();
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
    `${process.env.REACT_APP_API_URL}/api/auth/me`
  ));
});
