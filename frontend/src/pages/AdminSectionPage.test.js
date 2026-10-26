import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminSectionPage from './AdminSectionPage';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/apiUrl';

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
    isActive: true,
  },
  platformAdmin,
];
const areas = [{ _id: 'north', name: 'North', waitingItemCount: 3 }];

const renderUsersPage = () => render(
  <MemoryRouter>
    <AdminSectionPage type="allUsers" />
  </MemoryRouter>
);

const openAreaAdminMenu = async (name = 'Area Admin') => {
  const row = await screen.findByRole('row', { name: new RegExp(name) });
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
};

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

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));
  const passwordInput = await screen.findByLabelText('Temporary password');
  expect(passwordInput).toHaveAttribute('placeholder', 'Temporary password');
  expect(screen.queryByText('Temporary password')).not.toBeInTheDocument();
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
  fireEvent.change(screen.getByRole('combobox', { name: 'Select an assigned area' }), { target: { value: 'North' } });
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
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Area Admin Account' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '+ New Area Admin' }));
  expect(await screen.findByLabelText('Temporary password')).toHaveValue('');
  const successMessage = 'Admin created. Please give the temporary password to the admin directly. They must change it on first login.';
  expect(screen.getByRole('status')).toHaveTextContent(successMessage);
  expect(screen.getByRole('status').closest('.admin-success-banner')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('creates an Area Admin in a modal and refreshes the table on success', async () => {
  const createdAdmin = {
    _id: 'created-admin',
    name: 'New Area Admin',
    email: 'new-area@example.com',
    phone: '0912345678',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    isActive: true,
  };
  let created = false;
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : created ? [createdAdmin] : [],
  }));
  axios.post.mockImplementation(() => {
    created = true;
    return Promise.resolve({ data: { message: 'Admin account created.' } });
  });

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));
  const createDialog = await screen.findByRole('dialog', { name: 'Create Area Admin Account' });
  const createFooter = createDialog.querySelector('.admin-form-modal-actions');
  expect(within(createFooter).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  expect(within(createFooter).getByRole('button', { name: 'Create Admin' })).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: createdAdmin.name } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: createdAdmin.email } });
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'new_area_admin' } });
  fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'Temporary123' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Select an assigned area' }), { target: { value: 'North' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Admin' }));

  expect(await screen.findByRole('row', { name: /New Area Admin.*new-area@example.com.*North/ })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Create Area Admin Account' })).not.toBeInTheDocument();
});

test('Edit modal keeps footer actions visible, omits create help, and saves from the footer', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    phone: '0912345678',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    isActive: true,
  };
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : [areaAdmin],
  }));
  axios.put.mockResolvedValue({ data: { message: 'Area Admin updated successfully.' } });

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  await openAreaAdminMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit Area Admin' });
  expect(within(dialog).queryByText('Create an Area Admin account for one assigned area.')).not.toBeInTheDocument();
  const footer = dialog.querySelector('.admin-form-modal-actions');
  expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  fireEvent.change(within(dialog).getByPlaceholderText('Full name'), { target: { value: 'Updated Admin' } });
  fireEvent.click(within(footer).getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/users\/admin\/area-admin-id$/),
    expect.objectContaining({ name: 'Updated Admin', assignedArea: 'North' }),
    expect.objectContaining({ headers: expect.any(Object) }),
  ));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('admin form modal locks body scroll, traps focus, closes on Escape, and restores focus', async () => {
  const originalOverflow = document.body.style.overflow;
  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  const trigger = await screen.findByRole('button', { name: '+ New Area Admin' });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Create Area Admin Account' });
  expect(document.body.style.overflow).toBe('hidden');

  const closeButton = within(dialog).getByRole('button', { name: 'Close' });
  const submitButton = within(dialog).getByRole('button', { name: 'Create Admin' });
  expect(closeButton).toHaveFocus();
  fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
  expect(submitButton).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.overflow).toBe(originalOverflow);
  expect(trigger).toHaveFocus();
});

test('admin form modal closes from the backdrop without a confirmation prompt', async () => {
  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create Area Admin Account' });
  fireEvent.change(within(dialog).getByPlaceholderText('Full name'), { target: { value: 'Draft Admin' } });
  fireEvent.mouseDown(dialog.parentElement);

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(window.confirm).not.toHaveBeenCalled();
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

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));
  const createAreaSelect = await screen.findByRole('combobox', { name: 'Select an assigned area' });
  expect(screen.getByRole('option', { name: 'North (taken by North Admin)' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'South (taken by South Admin)' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await openAreaAdminMenu('North Admin');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  await waitFor(() => expect(screen.getByRole('option', { name: 'North' })).toBeEnabled());
  expect(screen.getByRole('option', { name: 'South (taken by South Admin)' })).toBeDisabled();
  expect(createAreaSelect).not.toBeInTheDocument();
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

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));
  fireEvent.change(await screen.findByPlaceholderText('Full name'), { target: { value: 'New Admin' } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'new_admin' } });
  fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'Temporary123' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Select an assigned area' }), { target: { value: 'South' } });
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

  await openAreaAdminMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reset password' }));
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

  await openAreaAdminMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reset password' }));
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

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));
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

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));

  fireEvent.click(await screen.findByRole('button', { name: '+ New Area Admin' }));
  const placesLink = await screen.findByRole('link', { name: 'Ethiopia Places' });
  expect(placesLink).toHaveAttribute('href', '/admin-dashboard/places');
  expect(screen.getByRole('combobox', { name: 'Select an assigned area' })).toHaveTextContent('No places registered yet');
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

test('Area Admin cards offer lifecycle actions without Delete', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    isActive: true,
  };
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : [areaAdmin],
  }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  expect(await screen.findByText(
    'To free an area, Demote the admin or Edit their area. Deactivate only blocks login and keeps the area reserved.',
  )).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute('aria-expanded', 'false');
  await openAreaAdminMenu();
  expect(screen.getByRole('menuitem', { name: 'Demote' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Reset password' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  expect(axios.delete).not.toHaveBeenCalled();
});

test('searches Area Admins and filters active status', async () => {
  const areaAdmins = Array.from({ length: 12 }, (_, index) => ({
    _id: `area-admin-${index + 1}`,
    name: `Admin ${index + 1}`,
    email: `admin${index + 1}@example.com`,
    phone: `09123456${String(index).padStart(2, '0')}`,
    role: 'admin',
    adminType: 'area',
    assignedArea: `Area ${index + 1}`,
    isActive: index % 2 === 0,
  }));
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : areaAdmins,
  }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Admin 1')).toBeInTheDocument();
  expect(screen.getByText('Area Admin results: 12')).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Search by name, email, phone, or area'), {
    target: { value: 'admin12@example.com' },
  });
  expect(await screen.findByText('Admin 12')).toBeInTheDocument();
  expect(screen.queryByText('Admin 1')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'inactive' } });
  expect(screen.getByRole('row', { name: /Admin 12.*admin12@example.com/ })).toBeInTheDocument();
  expect(screen.getByText('Area Admin results: 1')).toBeInTheDocument();
});

test('paginates Area Admins by ten and resets to a valid page when search changes', async () => {
  const areaAdmins = Array.from({ length: 12 }, (_, index) => ({
    _id: `area-admin-${index + 1}`,
    name: `Admin ${index + 1}`,
    email: `admin${index + 1}@example.com`,
    role: 'admin',
    adminType: 'area',
    assignedArea: `Area ${index + 1}`,
    isActive: true,
  }));
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : areaAdmins,
  }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Admin 1')).toBeInTheDocument();
  expect(screen.queryByText('Admin 11')).not.toBeInTheDocument();
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Admin 11')).toBeInTheDocument();
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('Search by name, email, phone, or area'), {
    target: { value: 'admin12@example.com' },
  });
  expect(screen.getByText('Admin 12')).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
});

test('Area Admin actions menu supports keyboard navigation and selecting menu items', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    email: 'area@example.com',
    role: 'admin',
    adminType: 'area',
    assignedArea: 'North',
    isActive: true,
  };
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : [areaAdmin],
  }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  const trigger = await screen.findByRole('button', { name: 'More actions' });
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  const menu = await screen.findByRole('menu', { name: 'Actions for Area Admin' });
  const menuItems = within(menu).getAllByRole('menuitem');
  expect(menuItems).toHaveLength(3);
  expect(menuItems.map((item) => item.textContent.trim())).toEqual(['Edit', 'Reset password', 'Demote']);
  expect(menuItems[0].querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(menu.querySelector('hr')).toBeInTheDocument();
  expect(menuItems[2]).toHaveClass('is-destructive');
  expect(within(screen.getByRole('row', { name: /Area Admin/ })).getByRole('button', { name: 'More actions' }))
    .toHaveAttribute('aria-expanded', 'true');
  expect(menuItems[0]).toHaveFocus();
  fireEvent.keyDown(menuItems[0], { key: 'ArrowDown' });
  expect(menuItems[1]).toHaveFocus();
  fireEvent.keyDown(menuItems[1], { key: 'Enter' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(document.getElementById('reset-admin-password-area-admin-id')).toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

test('Area Admin actions menu flips upward and closes on Escape, outside click, and scroll', async () => {
  const admins = [
    { _id: 'top', name: 'Top Admin', email: 'top@example.com', role: 'admin', adminType: 'area', assignedArea: 'North', isActive: true },
    { _id: 'bottom', name: 'Bottom Admin', email: 'bottom@example.com', role: 'admin', adminType: 'area', assignedArea: 'South', isActive: true },
  ];
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/api/areas') ? areas : admins }));

  render(
    <MemoryRouter>
      <AdminSectionPage type="adminManagement" />
    </MemoryRouter>,
  );

  const triggers = await screen.findAllByRole('button', { name: 'More actions' });
  jest.spyOn(triggers[0], 'getBoundingClientRect').mockReturnValue({
    top: 80, bottom: 120, left: 400, right: 440, width: 40, height: 40,
  });
  jest.spyOn(triggers[1], 'getBoundingClientRect').mockReturnValue({
    top: window.innerHeight - 70, bottom: window.innerHeight - 30, left: 400, right: 440, width: 40, height: 40,
  });

  fireEvent.click(triggers[0]);
  const topMenu = await screen.findByRole('menu');
  expect(topMenu).toHaveAttribute('data-placement', 'below');
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(triggers[0]).toHaveFocus();

  fireEvent.click(triggers[1]);
  const bottomMenu = await screen.findByRole('menu');
  expect(bottomMenu).toHaveAttribute('data-placement', 'above');
  fireEvent.scroll(document);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(triggers[1]).toHaveFocus();

  fireEvent.click(triggers[0]);
  await screen.findByRole('menu');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(triggers[0]).toHaveAttribute('aria-expanded', 'false');
  expect(triggers[0]).toHaveFocus();
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

  await openAreaAdminMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Demote' }));
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

  await openAreaAdminMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Demote' }));
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

  const tenantRow = await screen.findByRole('row', { name: /Tenant Example/ });
  fireEvent.click(within(tenantRow).getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Promote to Area Admin' }));
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

  await openAreaAdminMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Demote' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Deactivate only (no role)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/admin\/users\/area-admin-id\/role$/),
    { role: 'deactivate' },
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
  ));
});

test('Platform Admin can delete an eligible user after a clear confirmation', async () => {
  renderUsersPage();

  expect(await screen.findByText('Role: platform_admin')).toBeInTheDocument();
  const deleteButton = await screen.findByRole('button', { name: 'Delete Tenant Example' });
  expect(deleteButton).toHaveTextContent('');
  expect(deleteButton).toHaveAttribute('title', 'Delete user');
  expect(screen.queryByRole('button', { name: 'Delete Platform Admin' })).not.toBeInTheDocument();
  const platformAdminCard = screen.getByText('Role: platform_admin').closest('.admin-user-list-card');
  expect(platformAdminCard.querySelector('.admin-card-actions')).toBeNull();

  fireEvent.click(deleteButton);

  expect(window.confirm).toHaveBeenCalledWith(
    'Delete this user? They have no properties, active rentals, or payments. This cannot be undone.',
  );
  await waitFor(() => {
    expect(axios.delete).toHaveBeenCalledWith(
      apiUrl('/api/admin/users/tenant-id'),
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

test('Platform Admin can deactivate and reactivate an eligible user with confirmation and status badges', async () => {
  renderUsersPage();

  expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  expect(screen.getAllByText('Active')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

  expect(window.confirm).toHaveBeenCalledWith(
    'Deactivate this user and block them from logging in?',
  );
  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    apiUrl('/api/admin/users/tenant-id/active'),
    { isActive: false },
    { headers: { Authorization: 'Bearer platform-token' } },
  ));
  expect(await screen.findByText('Inactive')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
  expect(window.confirm).toHaveBeenLastCalledWith(
    'Activate this user and allow them to log in again?',
  );
  await waitFor(() => expect(axios.patch).toHaveBeenLastCalledWith(
    apiUrl('/api/admin/users/tenant-id/active'),
    { isActive: true },
    { headers: { Authorization: 'Bearer platform-token' } },
  ));
  await waitFor(() => expect(screen.getAllByText('Active')).toHaveLength(2));
});

test('Area Admin can deactivate related users but cannot delete them or act outside their own card', async () => {
  useAuth.mockReturnValue({
    user: { id: 'area-admin-id', role: 'admin', adminType: 'area', assignedArea: 'North' },
  });
  const scopedUsers = [
    { ...users[0], canDelete: false },
    { ...platformAdmin, isActive: true },
  ];
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas') ? areas : scopedUsers,
  }));

  renderUsersPage();

  expect(await screen.findByText('tenant@example.com')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete Tenant Example' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Deactivate Platform Admin' })).not.toBeInTheDocument();
  expect(axios.delete).not.toHaveBeenCalled();
});

test('Platform Admin cannot delete a user the server marks as ineligible', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/api/areas')
      ? areas
      : [{ ...users[0], canDelete: false, deletionCounts: { properties: 1, activeRentals: 0, payments: 0 } }, platformAdmin],
  }));
  renderUsersPage();

  expect(await screen.findByText('tenant@example.com')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete Tenant Example' })).not.toBeInTheDocument();
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
