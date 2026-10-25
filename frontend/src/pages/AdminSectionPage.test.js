import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminSectionPage from './AdminSectionPage';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match),
    formatDate: (date) => new Date(date).toLocaleDateString(),
  }),
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
const areas = [{ _id: 'north', name: 'North', waitingItemCount: 3 }];

const renderUsersPage = () => render(
  <MemoryRouter>
    <AdminSectionPage type="allUsers" />
  </MemoryRouter>
);

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

beforeEach(() => {
  localStorage.setItem('token', 'platform-token');
  axios.get.mockReset().mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : users,
  }));
  axios.post.mockReset().mockResolvedValue({ data: { message: 'Admin account created successfully' } });
  axios.put.mockReset().mockResolvedValue({ data: { message: 'Role changed successfully' } });
  axios.patch.mockReset().mockResolvedValue({ data: { message: 'Area Admin deactivated successfully.' } });
  axios.delete.mockReset().mockResolvedValue({ data: { message: 'User deleted successfully' } });
  useAuth.mockReturnValue({ user: platformAdmin });
  window.confirm = jest.fn(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([
  ['allUsers', 'all-users'],
  ['adminManagement', 'admin-management'],
  ['paymentPeriod', 'payment-period'],
])(
  'platform admin %s page links back to the dashboard',
  async (type, path) => {
    render(
      <MemoryRouter initialEntries={[`/admin-dashboard/${path}`]}>
        <Routes>
          <Route path="/admin-dashboard" element={<CurrentPath />} />
          <Route path={`/admin-dashboard/${path}`} element={<AdminSectionPage type={type} />} />
        </Routes>
      </MemoryRouter>,
    );

    const backLink = await screen.findByRole('link', { name: /back to dashboard/i });
    expect(backLink).toHaveAttribute('href', '/admin-dashboard');
    fireEvent.click(backLink);

    expect(screen.getByTestId('current-path')).toHaveTextContent('/admin-dashboard');
  },
);

test('shows and hides the create-admin password and resets it after submission', async () => {
  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  const passwordInput = await screen.findByLabelText('Temporary password');
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/areas$/),
    expect.objectContaining({ headers: { Authorization: 'Bearer platform-token' } }),
  );
  expect(passwordInput).toHaveAttribute('type', 'password');
  fireEvent.change(passwordInput, { target: { value: 'AreaAdmin123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(passwordInput).toHaveAttribute('type', 'text');
  expect(passwordInput).toHaveValue('AreaAdmin123');

  fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: 'Area Admin' } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'area@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'area_admin' } });
  fireEvent.change(screen.getByRole('combobox', { name: '' }), { target: { value: 'North' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Admin' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalled());
  expect(axios.post).toHaveBeenCalledWith(
    `${process.env.REACT_APP_API_URL}/api/admin/users/admin`,
    {
      fullName: 'Area Admin',
      email: 'area@example.com',
      phone: '',
      area: 'North',
      username: 'area_admin',
      password: 'AreaAdmin123',
    },
    { headers: { Authorization: 'Bearer platform-token' } },
  );
  expect(passwordInput).toHaveAttribute('minLength', '8');
  expect(await screen.findByRole('button', { name: 'Show password' })).toBeInTheDocument();
  expect(passwordInput).toHaveAttribute('type', 'password');
  expect(passwordInput).toHaveValue('');
  const successMessage = 'Admin created. Please give the temporary password to the admin directly. They must change it on first login.';
  expect(screen.getByRole('status')).toHaveTextContent(successMessage);
  expect(screen.getByRole('status').closest('.admin-success-banner')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('marks occupied areas unavailable in create and edit forms', async () => {
  const areaAdmins = [
    {
      _id: 'north-admin',
      name: 'North Admin',
      email: 'north@example.com',
      role: 'admin',
      adminType: 'area',
      assignedArea: 'North',
    },
    {
      _id: 'south-admin',
      name: 'South Admin',
      email: 'south@example.com',
      role: 'admin',
      adminType: 'area',
      assignedArea: 'South',
    },
  ];
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas')
      ? [{ _id: 'north', name: 'North' }, { _id: 'south', name: 'South' }]
      : areaAdmins,
  }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  const createAreaSelect = await screen.findByRole('combobox', { name: '' });
  expect(screen.getByRole('option', { name: 'North (taken by North Admin)' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'South (taken by South Admin)' })).toBeDisabled();

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  await waitFor(() => expect(screen.getByRole('option', { name: 'North' })).toBeEnabled());
  expect(screen.getByRole('option', { name: 'South (taken by South Admin)' })).toBeDisabled();
  expect(createAreaSelect).toBeInTheDocument();
});

test('shows a server conflict message in the Area Admin form', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas')
      ? [{ _id: 'north', name: 'North' }, { _id: 'south', name: 'South' }]
      : [{
        _id: 'north-admin',
        name: 'North Admin',
        email: 'north@example.com',
        role: 'admin',
        adminType: 'area',
        assignedArea: 'North',
      }],
  }));
  axios.post.mockRejectedValueOnce({
    response: { data: { message: 'Area South already has an Area Admin (South Admin). Demote or reassign that admin first.' } },
  });

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.change(await screen.findByPlaceholderText('Full name'), { target: { value: 'New Admin' } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'new_admin' } });
  fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'Temporary123' } });
  fireEvent.change(screen.getByRole('combobox', { name: '' }), { target: { value: 'South' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Admin' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Area South already has an Area Admin (South Admin). Demote or reassign that admin first.',
  );
});

test('Platform Admin resets an Area Admin password using the reset card action', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    adminAreas: [{ city: 'North' }],
  };
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/api/areas') ? areas : [areaAdmin] }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }));
  fireEvent.change(document.getElementById('reset-admin-password-area-admin-id'), { target: { value: 'replacement-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admins\/area-admin-id\/reset-password$/),
    { temporaryPassword: 'replacement-password' },
    { headers: { Authorization: 'Bearer platform-token' } },
  ));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Password reset. Please give the new temporary password to the admin directly. They must change it on next login.',
  );
  expect(document.getElementById('reset-admin-password-area-admin-id')).not.toBeInTheDocument();
});

test('shows a reset error in the shared dismissible notice without closing the reset form', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    adminAreas: [{ city: 'North' }],
  };
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/api/areas') ? areas : [areaAdmin] }));
  axios.post.mockRejectedValueOnce({ response: { data: { message: 'Temporary password reset failed.' } } });

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }));
  fireEvent.change(document.getElementById('reset-admin-password-area-admin-id'), { target: { value: 'replacement-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

  const notice = await screen.findByRole('alert');
  expect(notice).toHaveTextContent('Temporary password reset failed.');
  expect(notice).toHaveClass('admin-success-banner', 'admin-error-banner');
  expect(document.getElementById('reset-admin-password-area-admin-id')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('shows the area API status and message when loading areas fails', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/areas')) {
      return Promise.reject({
        response: { status: 503, data: { message: 'Area database unavailable.' } },
      });
    }
    return Promise.resolve({ data: users });
  });

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'HTTP 503: Area database unavailable.',
  );
});

test('links to Ethiopia Places when no places have been registered', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? [] : users,
  }));
  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  const placesLink = await screen.findByRole('link', { name: 'Ethiopia Places' });
  expect(placesLink).toHaveAttribute('href', '/admin-dashboard/places');
  expect(screen.getByRole('combobox')).toHaveTextContent('No places registered yet');
});

test.each([
  ['verified', 'verified'],
  ['rejected', 'rejected'],
  ['pending', 'pending'],
  ['allProperties', 'all-properties'],
  ['rentalRequests', 'rental-requests'],
])(
  'area admin %s page links back to the dashboard',
  async (type, path) => {
    const areaAdmin = { _id: 'area-admin-id', role: 'admin', adminType: 'area' };
    useAuth.mockReturnValue({ user: areaAdmin });

    render(
      <MemoryRouter initialEntries={[`/admin-dashboard/${path}`]}>
        <Routes>
          <Route path="/admin-dashboard" element={<CurrentPath />} />
          <Route path={`/admin-dashboard/${path}`} element={<AdminSectionPage type={type} />} />
        </Routes>
      </MemoryRouter>,
    );

    const backLink = await screen.findByRole('link', { name: '← Back to Dashboard' });
    expect(backLink).toHaveAttribute('href', '/admin-dashboard');
    fireEvent.click(backLink);

    expect(screen.getByTestId('current-path')).toHaveTextContent('/admin-dashboard');
  },
);

test('area admin can return from rental request details to the requests list', async () => {
  const areaAdmin = { _id: 'area-admin-id', role: 'admin', adminType: 'area' };
  const rentalRequest = {
    _id: 'request-id',
    property: { _id: 'property-id', title: 'Rental Property' },
    tenant: { name: 'Tenant Example' },
    status: 'pending',
  };
  useAuth.mockReturnValue({ user: areaAdmin });
  axios.get.mockImplementation((url) => (
    url.includes('/api/rental-requests/admin-requests')
      ? Promise.resolve({ data: [rentalRequest] })
      : Promise.resolve({ data: rentalRequest.property })
  ));

  render(
    <MemoryRouter>
      <AdminSectionPage type="rentalRequests" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'View Details' }));
  expect(await screen.findByRole('dialog', { name: 'Rental Request Details' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '← Back to Previous' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('Rental Property')).toBeInTheDocument();
});

test('Area Admin property cards show the latest handler snapshot and former-admin label', async () => {
  const areaAdmin = { _id: 'area-admin-id', role: 'admin', adminType: 'area' };
  useAuth.mockReturnValue({ user: areaAdmin });
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.includes('/api/admin/properties?status=approved')
      ? [{
        _id: 'property-id',
        title: 'Handled Property',
        verificationStatus: 'approved',
        isVerified: true,
        decision: 'verified',
        handledBy: 'former-admin-id',
        handledByName: 'Admin A',
        handledByRole: 'area_admin',
        handledAt: '2026-01-02T10:00:00.000Z',
        handledByIsFormerAdmin: true,
      }]
      : [],
  }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="verified" />
    </MemoryRouter>,
  );

  expect(await screen.findByText(/Verified by Admin A on/)).toBeInTheDocument();
  expect(screen.getByText(/Verified by Admin A on.*\(former admin\)/)).toBeInTheDocument();
});

test('deactivates an Area Admin with an area handover confirmation', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    adminAreas: [{ city: 'North' }],
    isActive: true,
  };
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/api/areas') ? areas : [areaAdmin] }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
  expect(window.confirm).toHaveBeenCalledWith(
    '3 unfinished items will stay in North until a new admin is assigned. Completed work stays in history.\n\nDeactivate Area Admin?',
  );
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/users\/admin\/area-admin-id\/active$/),
    { isActive: false },
    { headers: { Authorization: 'Bearer platform-token' } },
  ));
  expect(await screen.findByRole('status')).toHaveTextContent('Area Admin deactivated successfully.');
});

test('requires a role choice before demoting an Area Admin', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    adminAreas: [{ city: 'North' }],
    isActive: true,
  };
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/api/areas') ? areas : [areaAdmin] }));
  axios.put.mockResolvedValue({ data: { message: 'Area Admin demoted to landlord.' } });

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Demote' }));
  const dialog = await screen.findByRole('dialog', { name: 'Change Area Admin role' });
  expect(dialog).toHaveTextContent('3 unfinished items will stay in North until a new admin is assigned. Completed work stays in history.');
  expect(screen.getByRole('radio', { name: 'Landlord' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Tenant' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Deactivate only (no role)' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Confirm role change' })).toBeDisabled();

  fireEvent.click(screen.getByRole('radio', { name: 'Landlord' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }));
  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/users\/area-admin-id\/role$/),
    { role: 'landlord' },
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
  ));
  expect(await screen.findByRole('status')).toHaveTextContent('Area Admin demoted to Landlord.');
});

test('confirms using an existing account with the same email instead of creating a duplicate', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    adminAreas: [{ city: 'North' }],
    isActive: true,
  };
  const duplicate = {
    code: 'EXISTING_ACCOUNT_CONFIRMATION_REQUIRED',
    existingAccountId: 'tenant-existing-id',
    existingAccountRole: 'tenant',
    message: 'An existing Tenant account uses this email. Confirm to deactivate this Area Admin and use the existing account.',
  };
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/api/areas') ? areas : [areaAdmin] }));
  axios.put
    .mockRejectedValueOnce({ response: { data: duplicate } })
    .mockResolvedValueOnce({ data: { message: 'Existing tenant account selected.' } });

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Demote' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Tenant' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(2));
  expect(window.confirm).toHaveBeenCalledWith(duplicate.message);
  expect(axios.put).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/api\/admin\/users\/area-admin-id\/role$/),
    { role: 'tenant', confirmExistingAccount: true, existingAccountId: 'tenant-existing-id' },
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
  );
});

test('promotes a Tenant to Area Admin only after selecting an area', async () => {
  renderUsersPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Promote to Area Admin' }));
  expect(await screen.findByRole('dialog', { name: 'Promote to Area Admin' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm promotion' })).toBeDisabled();

  fireEvent.change(screen.getByRole('combobox', { name: 'Assigned area' }), {
    target: { value: 'North' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm promotion' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/users\/tenant-id\/role$/),
    { role: 'area_admin', assignedArea: 'North' },
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
  ));
});

test('allows deactivation without assigning a role', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    adminAreas: [{ city: 'North' }],
    isActive: true,
  };
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/api/areas') ? areas : [areaAdmin] }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Demote' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Deactivate only (no role)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/users\/area-admin-id\/role$/),
    { role: 'deactivate' },
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
  ));
});

test('platform admin can delete another user after confirmation', async () => {
  renderUsersPage();

  expect(await screen.findByText('Role: platform_admin')).toBeInTheDocument();
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
