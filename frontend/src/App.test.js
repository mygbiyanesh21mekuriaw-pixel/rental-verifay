import { render, screen, within, fireEvent } from '@testing-library/react';
import axios from 'axios';
import App from './App';
import { AuthProvider } from './context/AuthContext';

jest.mock('axios');

const renderApp = () => render(
  <AuthProvider>
    <App />
  </AuthProvider>
);

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
  axios.get.mockResolvedValue({ data: [] });
});

test('renders only the public navigation before login', async () => {
  renderApp();

  const navbar = await screen.findByRole('navigation');
  expect(await screen.findByRole('heading', { name: /house rental management system/i })).toBeInTheDocument();
  expect(within(navbar).getByRole('link', { name: /home/i })).toBeInTheDocument();
  expect(within(navbar).getByRole('link', { name: /about us/i })).toBeInTheDocument();
  expect(within(navbar).getByRole('link', { name: /contact us/i })).toBeInTheDocument();
  expect(within(navbar).getByRole('link', { name: /login/i })).toBeInTheDocument();
  expect(within(navbar).getByRole('link', { name: /register/i })).toBeInTheDocument();
  expect(within(navbar).queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  expect(within(navbar).queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
});

test.each(['/admin-dashboard', '/tenant-dashboard', '/landlord-dashboard'])(
  'redirects logged-out users from %s to login', (path) => {
    window.history.pushState({}, '', path);
    renderApp();

    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
  }
);

test('show landlord dashboard actions for the main sections', async () => {
  localStorage.setItem('token', 'landlord-token');
  localStorage.setItem('user', JSON.stringify({ id: 'landlord-1', role: 'landlord', name: 'Landlord Test' }));
  axios.get.mockResolvedValue({ data: { user: { id: 'landlord-1', role: 'landlord', name: 'Landlord Test' } } });
  window.history.pushState({}, '', '/landlord-dashboard');

  renderApp();

  expect(await screen.findByRole('heading', { name: /landlord dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /rental requests/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /rent payments/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /profile/i })).toBeInTheDocument();
});

test('clears the session and redirects to login when logout is clicked', async () => {
  localStorage.setItem('token', 'tenant-token');
  localStorage.setItem('user', JSON.stringify({ id: 'tenant-1', role: 'tenant', name: 'Tenant Test' }));
  axios.get.mockResolvedValue({ data: { user: { id: 'tenant-1', role: 'tenant', name: 'Tenant Test' } } });
  window.history.pushState({}, '', '/tenant-dashboard');

  renderApp();

  const logoutButton = await screen.findByRole('button', { name: /logout/i });
  fireEvent.click(logoutButton);

  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('user')).toBeNull();
  expect(window.location.pathname).toBe('/login');
});
