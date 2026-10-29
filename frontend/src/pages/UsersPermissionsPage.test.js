import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import UsersPermissionsPage from './UsersPermissionsPage';
import { LanguageProvider } from '../context/LanguageContext';

jest.mock('axios');

const user = {
  _id: 'tenant-id',
  name: 'Tenant Example',
  email: 'tenant@example.com',
  role: 'tenant',
  status: 'pending',
};

const makeRoleDetails = (role) => ({
  role,
  status: 'pending',
  catalog: role === 'tenant'
    ? [
      { permissionKey: 'dashboard', enabled: true },
      { permissionKey: 'favorites', enabled: true },
    ]
    : [
      { permissionKey: 'dashboard', enabled: true },
      { permissionKey: 'myProperties', enabled: true },
    ],
  permissions: role === 'tenant'
    ? { dashboard: true, favorites: true }
    : { dashboard: true, myProperties: true },
});

const renderPage = () => render(
  <LanguageProvider>
    <MemoryRouter>
      <UsersPermissionsPage />
    </MemoryRouter>
  </LanguageProvider>,
);

beforeEach(() => {
  user.status = 'pending';
  localStorage.setItem('token', 'platform-token');
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/admin/users?status=pending')) return Promise.resolve({ data: user.status === 'pending' ? [user] : [] });
    if (url.endsWith('/api/admin/users')) return Promise.resolve({ data: [user] });
    if (url.endsWith('/api/areas')) return Promise.resolve({ data: [] });
    if (url.includes('/permissions?role=')) {
      const role = new URL(url, 'http://localhost').searchParams.get('role');
      return Promise.resolve({ data: makeRoleDetails(role) });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  axios.put.mockResolvedValue({ data: { permissions: { dashboard: true, favorites: false } } });
  axios.post.mockImplementation((url) => {
    if (url.endsWith('/approve')) user.status = 'active';
    if (url.endsWith('/reject')) user.status = 'rejected';
    return Promise.resolve({ data: { message: 'User review saved.' } });
  });
});

afterEach(() => jest.clearAllMocks());

test('shows pending badge and role permission switches with always-on items locked', async () => {
  renderPage();
  expect(await screen.findByText('1 pending')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Tenant Example' })).toBeInTheDocument();
  const pageContent = screen.getByRole('heading', { name: 'Roles & Permissions' }).closest('section');
  expect(pageContent).not.toHaveClass('h-screen', 'overflow-hidden', 'overflow-auto');
  const columns = screen.getByRole('heading', { name: 'Tenant Example' }).closest('section').parentElement;
  expect(columns).toHaveClass('lg:grid-cols-[360px_minmax(0,1fr)]', 'pb-24');
  const userList = screen.getByRole('region', { name: 'Users' });
  expect(userList).toHaveClass('lg:sticky', 'lg:top-4');
  expect(userList.querySelector('.max-h-\\[320px\\]')).toHaveClass(
    'overflow-y-auto',
    'lg:max-h-[calc(100vh-24rem)]',
  );
  const permissionGroup = screen.getByRole('heading', { name: 'Discovery' }).closest('section');
  expect(permissionGroup.querySelector('.xl\\:grid-cols-2')).toBeInTheDocument();
  expect(screen.getByLabelText(/Favorites/).closest('label')).toHaveClass('py-3.5');
  const actionBar = screen.getByRole('button', { name: 'Save changes' }).closest('div.sticky');
  expect(actionBar).toHaveClass('sticky', 'bottom-0', 'border-t', 'z-20');
  expect(actionBar).not.toHaveClass('fixed', 'inset-x-0');
  const dashboardCheckbox = await screen.findByLabelText(/Dashboard/);
  expect(dashboardCheckbox).toHaveAttribute('role', 'switch');
  expect(dashboardCheckbox).toBeChecked();
  expect(dashboardCheckbox).toBeDisabled();
  expect(screen.getByLabelText(/Favorites/)).toBeChecked();
  expect(screen.getByText('Discovery')).toBeInTheDocument();
  expect(screen.getByText('Account')).toBeInTheDocument();
});

test('changing role immediately fetches and displays the selected role catalog', async () => {
  renderPage();
  await screen.findByLabelText(/Favorites/);
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'landlord' } });

  expect(await screen.findByLabelText(/My Properties/)).toBeChecked();
  expect(screen.queryByLabelText(/Favorites/)).not.toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/admin/users/tenant-id/permissions?role=landlord'),
    expect.objectContaining({ headers: { Authorization: 'Bearer platform-token' } }),
  );
});

test('pending user approval saves selected permissions and status in one request', async () => {
  renderPage();
  const favoritesCheckbox = await screen.findByLabelText(/Favorites/);
  fireEvent.click(favoritesCheckbox);
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/admin/users/tenant-id/approve'),
    {
      role: 'tenant',
      status: 'active',
      permissions: { dashboard: true, favorites: false },
    },
    expect.objectContaining({ headers: { Authorization: 'Bearer platform-token' } }),
  ));
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/admin/users/tenant-id/approve'),
    {
      role: 'tenant',
      status: 'active',
      permissions: { dashboard: true, favorites: false },
    },
    expect.objectContaining({ headers: { Authorization: 'Bearer platform-token' } }),
  );
  expect(axios.put).not.toHaveBeenCalled();
  expect(await screen.findByText('User approved and permissions saved.')).toBeInTheDocument();
});

test('pending user can be rejected and the pending counter refreshes', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Tenant Example' });
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/admin/users/tenant-id/reject'),
    {},
    expect.objectContaining({ headers: { Authorization: 'Bearer platform-token' } }),
  ));
  expect(await screen.findByText('0 pending')).toBeInTheDocument();
  expect(await screen.findByText('Rejected', { selector: 'span' })).toBeInTheDocument();
});

test('saving a changed role persists it and refreshes the selected user', async () => {
  const savedUser = { ...user };
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/admin/users?status=pending')) return Promise.resolve({ data: [savedUser] });
    if (url.endsWith('/api/admin/users')) return Promise.resolve({ data: [savedUser] });
    if (url.endsWith('/api/areas')) return Promise.resolve({ data: [] });
    if (url.includes('/permissions?role=')) {
      const selectedRole = new URL(url, 'http://localhost').searchParams.get('role');
      return Promise.resolve({ data: makeRoleDetails(selectedRole) });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  axios.put.mockImplementation((url, payload) => {
    savedUser.role = payload.role;
    savedUser.status = payload.status;
    return Promise.resolve({ data: { user: savedUser } });
  });

  renderPage();
  fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'landlord' } });
  await screen.findByLabelText(/My Properties/);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalled());
  const saveCall = axios.put.mock.calls.find(([url]) => url.includes('/api/admin/users/tenant-id/permissions'));
  expect(saveCall[1]).toEqual({
    role: 'landlord',
    status: 'pending',
    permissions: { dashboard: true, myProperties: true },
  });
  expect(await screen.findByText('Role and permissions saved.')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Role')).toHaveValue('landlord'));
  expect(axios.get.mock.calls.filter(([url]) => url.endsWith('/api/admin/users')).length).toBeGreaterThan(1);
});

test('warns before switching users when there are unsaved changes', async () => {
  const secondUser = {
    _id: 'landlord-id',
    name: 'Landlord Example',
    email: 'landlord@example.com',
    role: 'landlord',
    status: 'active',
  };
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/admin/users?status=pending')) return Promise.resolve({ data: [user] });
    if (url.endsWith('/api/admin/users')) return Promise.resolve({ data: [user, secondUser] });
    if (url.endsWith('/api/areas')) return Promise.resolve({ data: [] });
    if (url.includes('/permissions?role=')) {
      const role = new URL(url, 'http://localhost').searchParams.get('role');
      return Promise.resolve({ data: makeRoleDetails(role) });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);

  renderPage();
  fireEvent.click(await screen.findByLabelText(/Favorites/));
  fireEvent.click(screen.getByRole('button', { name: /Landlord Example/ }));

  expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Discard them and switch users?');
  expect(screen.getByRole('heading', { name: 'Tenant Example' })).toBeInTheDocument();
  confirm.mockRestore();
});

test('select all and clear all update permissions by section', async () => {
  renderPage();
  await screen.findByLabelText(/Favorites/);
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  expect(screen.getByLabelText(/Favorites/)).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(screen.getByLabelText(/Favorites/)).not.toBeChecked();
  expect(screen.getByLabelText(/Dashboard/)).toBeChecked();
});

test('Platform Admin details are read-only and do not load an editable permission catalog', async () => {
  const platformAdmin = {
    _id: 'platform-admin-id',
    name: 'Platform Admin',
    email: 'platform@example.com',
    role: 'admin',
    adminType: 'platform',
    status: 'active',
  };
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/admin/users?status=pending')) return Promise.resolve({ data: [] });
    if (url.endsWith('/api/admin/users')) return Promise.resolve({ data: [platformAdmin] });
    if (url.endsWith('/api/areas')) return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

  renderPage();

  expect(await screen.findByText('Platform Admin access is always full and cannot be edited.')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  expect(axios.get).not.toHaveBeenCalledWith(expect.stringContaining('/permissions?role='));
});