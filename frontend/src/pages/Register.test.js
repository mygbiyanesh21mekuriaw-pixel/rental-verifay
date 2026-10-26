import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';

jest.mock('axios');

beforeEach(() => {
  localStorage.clear();
  axios.get.mockResolvedValue({ data: [{ _id: 'north', name: 'North' }] });
  axios.post.mockResolvedValue({
    data: {
      token: 'test-token',
      user: { role: 'tenant' },
    },
  });
});

test('registration requires a username before sending the request', () => {
  const { container } = render(
    <LanguageProvider>
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    </LanguageProvider>
  );

  const usernameInput = container.querySelector('input[name="username"]');
  expect(usernameInput).toBeRequired();

  fireEvent.change(container.querySelector('input[name="name"]'), {
    target: { value: 'Tenant Example' },
  });
  fireEvent.change(container.querySelector('input[name="email"]'), {
    target: { value: 'tenant@example.com' },
  });
  fireEvent.change(container.querySelector('input[name="phone"]'), {
    target: { value: '0912345678' },
  });
  fireEvent.change(container.querySelector('input[name="password"]'), {
    target: { value: 'secure-password' },
  });
  fireEvent.change(container.querySelector('input[name="confirmPassword"]'), {
    target: { value: 'secure-password' },
  });
  fireEvent.change(container.querySelector('select[name="role"]'), {
    target: { value: 'tenant' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));

  expect(screen.getByText('Username is required')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test.each(['landlord', 'tenant'])('registers a %s without an area field', async (role) => {
  const { container } = render(
    <LanguageProvider>
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    </LanguageProvider>
  );

  expect(container.querySelector('[name="area"]')).not.toBeInTheDocument();
  fireEvent.change(container.querySelector('input[name="name"]'), {
    target: { value: `${role} example` },
  });
  fireEvent.change(container.querySelector('input[name="email"]'), {
    target: { value: `${role}@example.com` },
  });
  fireEvent.change(container.querySelector('input[name="username"]'), {
    target: { value: `${role}_example` },
  });
  fireEvent.change(container.querySelector('input[name="phone"]'), {
    target: { value: '0912345678' },
  });
  fireEvent.change(container.querySelector('input[name="password"]'), {
    target: { value: 'secure-password' },
  });
  fireEvent.change(container.querySelector('input[name="confirmPassword"]'), {
    target: { value: 'secure-password' },
  });
  fireEvent.change(container.querySelector('select[name="role"]'), {
    target: { value: role },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/auth\/register$/),
    {
      name: `${role} example`,
      email: `${role}@example.com`,
      username: `${role}_example`,
      password: 'secure-password',
      phone: '0912345678',
      profilePhoto: '',
      role,
    },
  ));
  expect(axios.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/public/areas'));
});

test('registration accepts usernames with 3-20 letters, numbers, and underscores', () => {
  const { container } = render(
    <LanguageProvider>
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    </LanguageProvider>
  );

  const usernameInput = container.querySelector('input[name="username"]');
  expect(usernameInput).toHaveAttribute('maxLength', '20');
  expect(usernameInput).toHaveAttribute('pattern', '[A-Za-z0-9_]{3,20}');

  fireEvent.change(usernameInput, { target: { value: 'ab' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  expect(screen.getByText('Use 3-20 letters, numbers, or underscores')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test('shows terms and privacy links below the registration form', () => {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    </LanguageProvider>
  );

  expect(screen.getByText(/By registering, you agree to our/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy-policy');
});
