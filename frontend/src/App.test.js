import { render, screen, within, fireEvent } from '@testing-library/react';
import axios from 'axios';
import App from './App';
import { AuthProvider } from './context/AuthContext';

jest.mock('axios');
jest.mock('./pages/TenantSearch', () => () => null);

const renderApp = () =>
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');

  axios.get.mockResolvedValue({
    data: [],
  });
});

test('renders only the public navigation before login', async () => {
  renderApp();

  const [navbar] = await screen.findAllByRole('navigation');

  expect(
    await screen.findByRole('heading', {
      name: 'House Rental',
    })
  ).toBeInTheDocument();

  expect(
    within(navbar).getByRole('img', {
      name: /mekdela amba university logo/i,
    })
  ).toHaveAttribute(
    'src',
    '/mekdela-amba-logo.jpeg'
  );

  expect(
    within(navbar).getByText('House Rental')
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

  const footerNavigation =
    within(footer).getByRole('navigation', {
      name: /footer navigation/i,
    });

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

  expect(
    within(footerNavigation).queryByRole('link', {
      name: /login|register/i,
    })
  ).not.toBeInTheDocument();
});

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
  'hides the footer on %s',
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
    await screen.findByRole('heading', {
      name: /landlord dashboard/i,
    })
  ).toBeInTheDocument();

  expect(
    screen.queryByRole('contentinfo')
  ).not.toBeInTheDocument();

  expect(
    screen.getByRole('button', {
      name: /rental requests/i,
    })
  ).toBeInTheDocument();

  expect(
    screen.getByRole('button', {
      name: /rent payments/i,
    })
  ).toBeInTheDocument();

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