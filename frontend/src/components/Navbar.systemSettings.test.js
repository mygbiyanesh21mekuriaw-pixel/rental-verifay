import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Navbar from './Navbar';

let mockUser;

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn() }),
}));
jest.mock('./LanguageSwitcher', () => () => null);
jest.mock('./ProfilePhotoControl', () => () => null);
jest.mock('./ProfileAvatar', () => () => null);
jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (value) => value }),
}));
jest.mock('../context/SystemStatusContext', () => ({
  useSystemStatus: () => ({
    status: {
      branding: { websiteName: 'RentalVerify', websiteLogoDataUri: '' },
    },
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test.each([
  ['Tenant', { role: 'tenant' }, false],
  ['Landlord', { role: 'landlord' }, false],
  ['Area Admin', { role: 'admin', adminType: 'area' }, false],
  ['Platform Admin', { role: 'admin', adminType: 'platform' }, true],
])('%s sees System Settings only when platform admin', (_roleName, user, allowed) => {
  mockUser = user;
  axios.get.mockResolvedValue({ data: { unreadCount: 0 } });

  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );

  if (allowed) {
    expect(screen.getByRole('link', { name: 'System Settings' })).toHaveAttribute(
      'href',
      '/admin-dashboard/system-settings',
    );
  } else {
    expect(screen.queryByRole('link', { name: 'System Settings' })).not.toBeInTheDocument();
  }
});

test('notification badge follows page updates and refreshes on window focus', async () => {
  mockUser = { role: 'admin', adminType: 'area' };
  axios.get
    .mockResolvedValueOnce({ data: { unreadCount: 2 } })
    .mockResolvedValueOnce({ data: { unreadCount: 4 } });

  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('link', { name: 'Notifications, 2 unread' })).toBeInTheDocument();
  window.dispatchEvent(new CustomEvent('notifications:unread-count', { detail: { unreadCount: 3 } }));
  expect(await screen.findByRole('link', { name: 'Notifications, 3 unread' })).toBeInTheDocument();

  fireEvent.focus(window);
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('link', { name: 'Notifications, 4 unread' })).toBeInTheDocument();
});

test.each([
  ['Area Admin', { role: 'admin', adminType: 'area' }, true],
  ['Platform Admin', { role: 'admin', adminType: 'platform' }, false],
])('%s sees the Area Admin contact inbox only when assigned the area-admin role', (_roleName, user, allowed) => {
  mockUser = user;
  axios.get.mockResolvedValue({ data: { unreadCount: 0 } });

  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );

  if (allowed) {
    expect(screen.getByRole('link', { name: 'Contact Messages' })).toHaveAttribute(
      'href',
      '/admin-dashboard/contact-messages',
    );
  } else {
    expect(screen.queryByRole('link', { name: 'Contact Messages' })).not.toBeInTheDocument();
  }
});
