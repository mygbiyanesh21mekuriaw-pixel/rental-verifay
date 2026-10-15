import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import SystemSettings from './SystemSettings';

jest.mock('axios', () => ({ get: jest.fn(), put: jest.fn(), post: jest.fn() }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ loadUser: jest.fn() }),
}));
jest.mock('../context/SystemStatusContext', () => ({
  useSystemStatus: () => ({ refreshStatus: jest.fn() }),
}));

const platformSettings = {
  defaultAppearance: 'system',
  notifications: { inAppEnabled: true, emailEnabled: true },
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

beforeEach(() => {
  axios.get.mockResolvedValue({ data: { settings: platformSettings } });
  axios.put.mockResolvedValue({ data: { settings: platformSettings } });
});

afterEach(() => {
  jest.clearAllMocks();
});

test('switches sections accessibly and preserves settings for the single save', async () => {
  render(
    <MemoryRouter>
      <SystemSettings />
    </MemoryRouter>,
  );

  const generalTab = await screen.findByRole('tab', { name: 'General' });
  expect(generalTab).toHaveAttribute('aria-selected', 'true');

  fireEvent.change(screen.getByLabelText('Website name'), { target: { value: 'New website name' } });
  fireEvent.keyDown(generalTab, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Appearance & Notifications' })).toHaveAttribute('aria-selected', 'true');

  fireEvent.click(screen.getByRole('tab', { name: 'Properties' }));
  const submissionsToggle = screen.getByRole('switch', { name: 'Allow new property submissions' });
  fireEvent.click(submissionsToggle);
  expect(submissionsToggle).not.toBeChecked();

  fireEvent.click(screen.getByRole('tab', { name: 'Maintenance' }));
  expect(screen.getByText('Platform Admins can continue working and turn maintenance mode off.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Properties' }));
  expect(screen.getByRole('switch', { name: 'Allow new property submissions' })).not.toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/admin/system-settings'),
    expect.objectContaining({
      general: expect.objectContaining({ websiteName: 'New website name' }),
      properties: expect.objectContaining({ submissionsEnabled: false }),
    }),
    expect.any(Object),
  ));
});

test('reveals a required field in another tab before saving', async () => {
  axios.get.mockResolvedValueOnce({
    data: {
      settings: {
        ...platformSettings,
        maintenance: { ...platformSettings.maintenance, message: '' },
      },
    },
  });
  render(
    <MemoryRouter>
      <SystemSettings />
    </MemoryRouter>,
  );

  await screen.findByRole('tab', { name: 'General' });
  fireEvent.click(screen.getByRole('tab', { name: 'Properties' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await waitFor(() => expect(screen.getByRole('tab', { name: 'Maintenance' })).toHaveAttribute('aria-selected', 'true'));
  expect(axios.put).not.toHaveBeenCalled();
});
