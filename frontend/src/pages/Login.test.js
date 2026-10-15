import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';
import { AuthProvider } from '../context/AuthContext';

jest.mock('axios');

beforeEach(() => {
  localStorage.clear();
  axios.post.mockResolvedValue({
    data: {
      token: 'test-token',
      user: { role: 'tenant' },
    },
  });
});

test('login submits normalized email and password as an identifier', async () => {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );

  const universityLogo = screen.getByRole('img', { name: 'Mekdela Amba University logo' });
  expect(universityLogo).toHaveAttribute('src', '/mekdela-amba-logo.jpeg');
  expect(universityLogo).toHaveClass('mx-auto');

  const emailInput = screen.getByLabelText('Email or Username');
  expect(emailInput).toHaveAttribute('placeholder', 'Enter your email or username');
  expect(emailInput).toHaveAttribute('type', 'text');

  fireEvent.change(emailInput, { target: { value: ' Tenant@Example.com ' } });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  await waitFor(() => {
    expect(axios.post).toHaveBeenCalledWith(
      `${process.env.REACT_APP_API_URL}/api/auth/login`,
      { identifier: 'tenant@example.com', password: 'correct-password' }
    );
  });
});

test('login accepts a username without email-format validation', async () => {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText('Email or Username'), {
    target: { value: ' Tenant_1 ' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  await waitFor(() => {
    expect(axios.post).toHaveBeenCalledWith(
      `${process.env.REACT_APP_API_URL}/api/auth/login`,
      { identifier: 'tenant_1', password: 'correct-password' }
    );
  });
});

test('login explains when an expired session requires signing in again', () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { sessionExpired: true } }]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

  expect(screen.getByRole('status')).toHaveTextContent(
    'Your session expired. Please sign in again to continue your payment.'
  );
});
