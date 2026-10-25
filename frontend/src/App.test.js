import { render, screen, within, fireEvent } from '@testing-library/react';
import axios from 'axios';
import App from './App';
import { AuthProvider } from './context/AuthContext';

jest.mock('axios');
jest.mock('./pages/TenantSearch', () => () => null);
jest.mock('./context/SystemStatusContext', () => ({
  SystemStatusProvider: ({ children }) => children,
  useSystemStatus: () => ({
    status: mockSystemStatus,
    loading: false,
    error: '',
    refreshStatus: jest.fn(),
  }),
  useOptionalSystemStatus: () => ({
    status: mockSystemStatus,
  }),
}));

let mockSystemStatus;

const renderApp = () =>
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
  mockSystemStatus = {
    maintenance: { enabled: false, message: 'Scheduled maintenance.' },
    branding: {
      websiteName: 'House Rental Management System',
      websiteLogoDataUri: '',
      contactEmail: '',
      contactPhone: '',
      contactAddress: '',
    },
  };
});

test('renders only the public navigation before login', async () => {
  renderApp();

  const [navbar] = await screen.findAllByRole('navigation');
  expect(navbar).toHaveClass('navbar-public');
  expect(navbar).not.toHaveClass('navbar-home');

  expect(
    screen.queryByRole('heading', {
      name: 'House Rental',
    })
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('A better way to find your next home')
  ).toBeInTheDocument();
  expect(
    screen.getByText('Find and rent verified properties with confidence.')
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Find Properties' })).toHaveAttribute('href', '/search');
  expect(screen.getByRole('link', { name: 'Learn More' })).toHaveAttribute('href', '/about');

  expect(
    within(navbar).getByRole('img', {
      name: /house rental management system logo/i,
    })
  ).toHaveAttribute(
    'src',
    '/mekdela-amba-logo.jpeg'
  );

  expect(
    within(navbar).getByText('House Rental Management System')
  ).toBeInTheDocument();

  expect(
    within(navbar).getByRole('button', {
      name: /open navigation menu/i,
    })
  ).toBeInTheDocument();

  expect(
    within(navbar).getByRole('link', {
      name: /home/i,
    })
  ).toBeInTheDocument();

  expect(
    within(navbar).getByRole('link', {
      name: /about us/i,
    })
  ).toBeInTheDocument();

  expect(
    within(navbar).getByRole('link', {
      name: /contact us/i,
    })
  ).toBeInTheDocument();

  expect(
    within(navbar).getByRole('link', {
      name: /login/i,
    })
  ).toBeInTheDocument();

  expect(
    within(navbar).getByRole('link', {
      name: /register/i,
    })
  ).toBeInTheDocument();

  expect(
    within(navbar).queryByRole('link', {
      name: /dashboard/i,
    })
  ).not.toBeInTheDocument();

  expect(
    within(navbar).queryByRole('link', {
      name: /admin/i,
    })
  ).not.toBeInTheDocument();

  const footer = screen.getByRole('contentinfo');

  expect(
    within(footer).getByText('Project Information')
  ).toBeInTheDocument();
  expect(
    within(footer).getByText('House Rental Management System')
  ).toBeInTheDocument();
  expect(
    within(footer).getByText('Student Academic Project')
  ).toBeInTheDocument();
  expect(
    within(footer).getByText('Mekdela Amba University')
  ).toBeInTheDocument();
  expect(
    within(footer).getByText('College of Computing and Informatics')
  ).toBeInTheDocument();

  const footerNavigation =
    within(footer).getByRole('navigation', {
      name: /footer navigation/i,
    });
  expect(
    within(footerNavigation).getByText('Quick Links')
  ).toBeInTheDocument();

  expect(
    within(footerNavigation).getByRole('link', {
      name: 'Home',
    })
  ).toBeInTheDocument();

  expect(
    within(footerNavigation).getByRole('link', {
      name: 'About Us',
    })
  ).toBeInTheDocument();

  expect(
    within(footerNavigation).getByRole('link', {
      name: 'Contact Us',
    })
  ).toBeInTheDocument();
  expect(within(footerNavigation).getByRole('link', { name: 'Login' }))
    .toHaveAttribute('href', '/login');
  expect(within(footerNavigation).getByRole('link', { name: 'Register' }))
    .toHaveAttribute('href', '/register');
  expect(
    within(footerNavigation).getByRole('link', { name: 'Home' })
  ).toHaveClass('app-footer-link');
  expect(
    within(footerNavigation).getByRole('link', { name: 'About Us' })
  ).toHaveClass('app-footer-link');
  expect(
    within(footerNavigation).getByRole('link', { name: 'Contact Us' })
  ).toHaveClass('app-footer-link');

  expect(
    within(footer).getByRole('link', {
      name: 'admin@gmail.com',
    })
  ).toHaveAttribute('href', 'mailto:admin@gmail.com');
  expect(
    within(footer).getByRole('link', { name: 'admin@gmail.com' }).querySelector('svg')
  ).toHaveAttribute('aria-hidden', 'true');
  expect(within(footer).getByText(/\+251 9X XXX XXXX/)).toBeInTheDocument();
  expect(within(footer).getByText(/Mekdela Amba, Ethiopia/)).toBeInTheDocument();
  expect(within(footer).getByRole('link', { name: 'Privacy Policy' }))
    .toHaveAttribute('href', '/privacy-policy');
  expect(within(footer).getByRole('link', { name: 'Terms of Service' }))
    .toHaveAttribute('href', '/terms');
  expect(within(footer).getByRole('group', { name: 'Social media links' }))
    .toBeInTheDocument();
  ['Telegram', 'Facebook', 'LinkedIn', 'Instagram'].forEach((label) => {
    expect(within(footer).getByRole('link', { name: label }))
      .toHaveAttribute('rel', 'noopener noreferrer');
  });
  expect(
    within(footer).getByText('© 2026 House Rental Management System. All Rights Reserved.')
  ).toBeInTheDocument();
});

test('footer legal links open the matching policy pages and footer remains available', async () => {
  renderApp();

  fireEvent.click(screen.getByRole('link', { name: 'Privacy Policy' }));
  expect(await screen.findByRole('heading', { name: 'Privacy Policy' }))
    .toBeInTheDocument();
  expect(screen.getByText('Information we collect')).toBeInTheDocument();
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
  expect(await screen.findByRole('heading', { name: 'Terms of Service' }))
    .toBeInTheDocument();
  expect(screen.getByText('Fraud and prohibited activity')).toBeInTheDocument();
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();
});

test('switches language immediately and keeps it when navigating to another page', async () => {
  renderApp();

  fireEvent.click(screen.getAllByRole('link', { name: 'About Us' })[0]);
  expect(await screen.findByRole('heading', { name: 'Our Mission' }))
    .toBeInTheDocument();

  const languageSelectors = await screen.findAllByRole('combobox', {
    name: 'Language / ቋንቋ',
  });
  fireEvent.change(languageSelectors[0], { target: { value: 'am' } });

  expect(localStorage.getItem('rentalverify-language')).toBe('am');
  expect(
    await screen.findByRole('heading', { name: 'ተልዕኳችን' })
  ).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('link', { name: 'ያግኙን' })[0]);
  expect(await screen.findByRole('heading', { name: 'ያግኙን' }))
    .toBeInTheDocument();
  expect(
    screen.getAllByRole('combobox')[0]
  ).toHaveValue('am');

  fireEvent.change(
    screen.getAllByRole('combobox')[0],
    { target: { value: 'en' } }
  );
  expect(await screen.findByRole('heading', { name: 'Contact Us' }))
    .toBeInTheDocument();
  expect(localStorage.getItem('rentalverify-language')).toBe('en');
});

test('keeps the full logo and brand visible after restoring an authenticated session', async () => {
  const landlord = {
    _id: 'landlord-id',
    name: 'Landlord Example',
    role: 'landlord',
  };
  localStorage.setItem('token', 'saved-token');
  localStorage.setItem('user', JSON.stringify(landlord));
  axios.get.mockResolvedValue({ data: { user: landlord } });

  renderApp();

  const brandLink = await screen.findByRole('link', {
    name: /house rental management system logo house rental management system/i,
  });
  expect(within(brandLink).getByRole('img', { name: /house rental management system logo/i }))
    .toHaveAttribute('src', '/mekdela-amba-logo.jpeg');
  expect(screen.getAllByText('House Rental Management System').length).toBeGreaterThan(0);
});

test('hides the footer on an authenticated dashboard', async () => {
  const landlord = {
    _id: 'landlord-id',
    name: 'Landlord Example',
    role: 'landlord',
  };
  window.history.pushState({}, '', '/landlord-dashboard');
  localStorage.setItem('token', 'saved-token');
  localStorage.setItem('user', JSON.stringify(landlord));
  axios.get.mockResolvedValue({ data: { user: landlord } });

  renderApp();

  await screen.findAllByRole('navigation');
  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
});

test('maintenance mode blocks public app pages but keeps Platform Admin sign-in available', async () => {
  mockSystemStatus.maintenance.enabled = true;
  window.history.pushState({}, '', '/');

  renderApp();

  expect(await screen.findByRole('heading', { name: 'Under maintenance' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Platform Admin sign in' })).toHaveAttribute('href', '/login');
  expect(screen.queryByText('A better way to find your next home')).not.toBeInTheDocument();
});

test('signed-in ordinary users can sign out during maintenance to allow a Platform Admin to sign in', async () => {
  mockSystemStatus.maintenance.enabled = true;
  const tenant = { _id: 'tenant-id', name: 'Tenant Example', role: 'tenant' };
  localStorage.setItem('token', 'tenant-token');
  localStorage.setItem('user', JSON.stringify(tenant));
  axios.get.mockResolvedValue({ data: { user: tenant } });

  renderApp();

  expect(await screen.findByRole('button', { name: 'Sign out to use another account' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out to use another account' }));
  expect(await screen.findByRole('link', { name: 'Platform Admin sign in' })).toBeInTheDocument();
});

test.each([
  ['/tenant-dashboard', 'tenant', undefined, 'Tenant Dashboard', 'የተከራይ ዳሽቦርድ'],
  ['/landlord-dashboard', 'landlord', undefined, 'Landlord Dashboard', 'የባለቤት ዳሽቦርድ'],
  ['/admin-dashboard', 'admin', 'area', 'Admin Dashboard', 'የአስተዳዳሪ ዳሽቦርድ'],
  ['/admin-dashboard', 'admin', 'platform', 'Admin Dashboard', 'የአስተዳዳሪ ዳሽቦርድ'],
])(
  'restores the saved language on the %s dashboard',
  async (path, role, adminType, englishHeading, amharicHeading) => {
    const user = {
      id: `${role}-1`,
      role,
      adminType,
      name: `${role} test`,
      systemPreferences: { defaultLanguage: 'en', defaultAppearance: 'system' },
    };
    localStorage.setItem('token', `${role}-token`);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('rentalverify-language', 'am');
    window.history.pushState({}, '', path);
    axios.get.mockResolvedValue({ data: { user } });

    renderApp();

    expect(await screen.findByRole('heading', { name: amharicHeading }))
      .toBeInTheDocument();
    expect(document.querySelector('.dashboard-welcome-banner')).toBeInTheDocument();
    expect(screen.getByRole('time')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0])
      .toHaveValue('am');
    expect(localStorage.getItem('rentalverify-language')).toBe('am');
    expect(screen.queryByRole('heading', { name: englishHeading }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveClass('rounded-xl', 'w-64');
    expect(screen.getByRole('main')).toHaveClass('p-3', 'md:p-4', 'bg-white');
    expect(document.querySelectorAll('.dashboard-shell-topbar')).toHaveLength(1);
    expect(document.querySelectorAll('.dashboard-layout-sidebar')).toHaveLength(1);
  }
);

test('toggles the mobile navigation and closes it after navigation', async () => {
  renderApp();

  const [navbar] =
    await screen.findAllByRole('navigation');

  const menuButton =
    within(navbar).getByRole('button', {
      name: /open navigation menu/i,
    });

  expect(menuButton).toHaveAttribute(
    'aria-expanded',
    'false'
  );

  fireEvent.click(menuButton);

  expect(menuButton).toHaveAttribute(
    'aria-expanded',
    'true'
  );

  fireEvent.click(
    within(navbar).getByRole('link', {
      name: /about us/i,
    })
  );

  expect(
    await within(navbar).findByRole('button', {
      name: /open navigation menu/i,
    })
  ).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

test.each(['/login', '/register'])(
  'hides the shared footer on %s',
  (path) => {
    window.history.pushState({}, '', path);

    renderApp();

    expect(
      screen.queryByRole('contentinfo')
    ).not.toBeInTheDocument();
  }
);

test.each([
  '/admin-dashboard',
  '/tenant-dashboard',
  '/landlord-dashboard',
])(
  'redirects logged-out users from %s to login',
  (path) => {
    window.history.pushState({}, '', path);

    renderApp();

    expect(
      screen.getByRole('heading', {
        name: /welcome back/i,
      })
    ).toBeInTheDocument();
  }
);

test('shows landlord dashboard actions for the main sections', async () => {
  localStorage.setItem(
    'token',
    'landlord-token'
  );

  localStorage.setItem(
    'user',
    JSON.stringify({
      id: 'landlord-1',
      role: 'landlord',
      name: 'Landlord Test',
    })
  );

  axios.get.mockResolvedValue({
    data: {
      user: {
        id: 'landlord-1',
        role: 'landlord',
        name: 'Landlord Test',
      },
    },
  });

  window.history.pushState(
    {},
    '',
    '/landlord-dashboard'
  );

  renderApp();

  expect(
    await screen.findAllByRole('combobox', { name: 'Language / ቋንቋ' })
  ).not.toHaveLength(0);

  expect(
    await screen.findByRole('heading', {
      name: /landlord dashboard/i,
    })
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('contentinfo')
  ).not.toBeInTheDocument();

  expect(
    screen.getAllByRole('link', {
      name: /rental requests/i,
    }).length
  ).toBeGreaterThan(0);

  expect(
    screen.getAllByRole('link', {
      name: /rent payments/i,
    }).length
  ).toBeGreaterThan(0);

expect(
  screen.getAllByRole('link', {
    name: /account settings/i,
  }).length
).toBeGreaterThan(0);

expect(
  screen.getAllByRole('link', {
    name: /bank information/i,
  }).length
).toBeGreaterThan(0);
});

test('clears the session and redirects to login when logout is clicked', async () => {
  localStorage.setItem(
    'token',
    'tenant-token'
  );

  localStorage.setItem(
    'user',
    JSON.stringify({
      id: 'tenant-1',
      role: 'tenant',
      name: 'Tenant Test',
    })
  );

  axios.get.mockResolvedValue({
    data: {
      user: {
        id: 'tenant-1',
        role: 'tenant',
        name: 'Tenant Test',
      },
    },
  });

  window.history.pushState(
    {},
    '',
    '/tenant-dashboard'
  );

  renderApp();

  const logoutButtons =
    await screen.findAllByRole('button', {
      name: /logout/i,
    });

  expect(logoutButtons.length).toBeGreaterThan(0);

  fireEvent.click(logoutButtons[0]);

  expect(
    localStorage.getItem('token')
  ).toBeNull();

  expect(
    localStorage.getItem('user')
  ).toBeNull();

  expect(window.location.pathname).toBe(
    '/login'
  );
});

test('blocks a first-login Area Admin from the dashboard until the password is changed', async () => {
  const areaAdmin = {
    _id: 'area-admin-id',
    name: 'Area Admin',
    role: 'admin',
    adminType: 'area',
    mustChangePassword: true,
  };
  window.history.pushState({}, '', '/admin-dashboard');
  localStorage.setItem('token', 'area-admin-token');
  localStorage.setItem('user', JSON.stringify(areaAdmin));
  axios.get.mockResolvedValue({ data: { user: areaAdmin } });

  renderApp();

  expect(await screen.findByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/change-password');
  expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
});