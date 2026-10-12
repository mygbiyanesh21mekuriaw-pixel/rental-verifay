import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import App from '../App';

let mockUser;

jest.mock('axios', () => ({ get: jest.fn(), put: jest.fn() }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    loadUser: jest.fn(),
  }),
}));
jest.mock('../components/Navbar', () => () => null);
jest.mock('./TenantSearch', () => () => null);
jest.mock('../context/SystemStatusContext', () => ({
  SystemStatusProvider: ({ children }) => children,
  useSystemStatus: () => ({
    status: {
      maintenance: { enabled: false },
      branding: { websiteName: 'RentalVerify', contactEmail: '', contactPhone: '', contactAddress: '' },
    },
    loading: false,
    error: '',
    refreshStatus: jest.fn(),
  }),
  useOptionalSystemStatus: () => null,
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

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

beforeAll(() => {
  window.scrollTo = jest.fn();
});

test.each([
  ['Tenant', { role: 'tenant' }, false],
  ['Landlord', { role: 'landlord' }, false],
  ['Area Admin', { role: 'admin', adminType: 'area' }, false],
  ['Platform Admin', { role: 'admin', adminType: 'platform' }, true],
])('%s %s access to the System Settings route', async (_roleName, user, allowed) => {
  mockUser = user;
  axios.get.mockImplementation((url) => Promise.resolve({
    data: String(url).includes('/api/system/status')
      ? {
        maintenance: { enabled: false },
        branding: { websiteName: 'RentalVerify', websiteLogoDataUri: '' },
      }
      : { settings: platformSettings },
  }));
  window.history.pushState({}, '', '/admin-dashboard/system-settings');

  render(<App />);

  if (allowed) {
    expect(await screen.findByRole('heading', { name: 'System Settings' })).toBeInTheDocument();
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/system-settings'),
      expect.any(Object),
    ));
  } else {
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'System Settings' })).not.toBeInTheDocument());
    expect(axios.get).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/system-settings'),
      expect.any(Object),
    );
  }
});
