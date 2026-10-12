import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SystemSettings from './SystemSettings';

const mockLoadUser = jest.fn();

jest.mock('axios', () => ({
  get: jest.fn(),
  put: jest.fn(),
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ loadUser: mockLoadUser }),
}));
jest.mock('../context/SystemStatusContext', () => ({
  useSystemStatus: () => ({
    refreshStatus: jest.fn().mockResolvedValue(undefined),
  }),
}));

const settings = {
  defaultAppearance: 'dark',
  notifications: { inAppEnabled: false, emailEnabled: true },
  general: {
    websiteName: 'RentalVerify',
    websiteLogoDataUri: '',
    contactEmail: '',
    contactPhone: '',
    contactAddress: '',
  },
  properties: { submissionsEnabled: true, requireAdminReview: true },
  maintenance: { enabled: false, message: 'Scheduled maintenance.' },
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/admin-dashboard/system-settings']}>
    <Routes>
      <Route path="/admin-dashboard" element={<div>Admin dashboard</div>} />
      <Route path="/admin-dashboard/system-settings" element={<SystemSettings />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.setItem('token', 'test-token');
});

test('loads saved settings using the configured API URL', async () => {
  axios.get.mockResolvedValue({ data: { settings } });

  renderPage();

  expect(await screen.findByLabelText('Default appearance')).toHaveValue('dark');
  expect(screen.queryByLabelText('Default language')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Enable in-app notifications')).not.toBeChecked();
  expect(screen.getByLabelText('Enable email notifications')).toBeChecked();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/system-settings$/),
    { headers: { Authorization: 'Bearer test-token' } },
  );
});

test('shows a useful message when the settings API cannot be reached', async () => {
  axios.get.mockRejectedValue(new Error('Network unavailable'));
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  renderPage();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not reach the server to load system settings.',
  );
  errorSpy.mockRestore();
});

test('saves settings and reports success', async () => {
  axios.get.mockResolvedValue({ data: { settings } });
  axios.put.mockResolvedValue({ data: { settings } });
  mockLoadUser.mockResolvedValue(undefined);

  renderPage();
  await screen.findByLabelText('Default appearance');
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/system-settings$/),
    settings,
    { headers: { Authorization: 'Bearer test-token' } },
  ));
  expect(await screen.findByRole('status')).toHaveTextContent('System settings saved successfully.');
  expect(mockLoadUser).toHaveBeenCalled();
});

test('saves general, property, and maintenance settings together', async () => {
  axios.get.mockResolvedValue({ data: { settings } });
  axios.put.mockResolvedValue({ data: { settings } });

  renderPage();
  await screen.findByLabelText('Website name');
  fireEvent.change(screen.getByLabelText('Website name'), { target: { value: 'RentalVerify Portal' } });
  fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'support@example.com' } });
  fireEvent.click(screen.getByLabelText('Allow new property submissions'));
  fireEvent.click(screen.getByLabelText('Require admin review before properties are publicly visible'));
  fireEvent.click(screen.getByLabelText('Enable maintenance mode'));
  fireEvent.change(screen.getByLabelText('Maintenance message'), {
    target: { value: 'We will return shortly.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/system-settings$/),
    expect.objectContaining({
      general: expect.objectContaining({
        websiteName: 'RentalVerify Portal',
        contactEmail: 'support@example.com',
      }),
      properties: { submissionsEnabled: false, requireAdminReview: false },
      maintenance: { enabled: true, message: 'We will return shortly.' },
    }),
    expect.any(Object),
  ));
  expect(await screen.findByRole('status')).toHaveTextContent('System settings saved successfully.');
});
