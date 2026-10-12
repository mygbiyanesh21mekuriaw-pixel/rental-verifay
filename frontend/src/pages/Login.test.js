import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
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

test('login submits normalized email and password using the backend email API format', async () => {
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

  const emailInput = screen.getByLabelText('Email');
  expect(emailInput).toHaveAttribute('placeholder', 'Enter your email');
  expect(emailInput).toHaveAttribute('type', 'email');

  fireEvent.change(emailInput, { target: { value: ' Tenant@Example.com ' } });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  await waitFor(() => {
    expect(axios.post).toHaveBeenCalledWith(
      `${process.env.REACT_APP_API_URL}/api/auth/login`,
      { email: 'tenant@example.com', password: 'correct-password' }
    );
  });
});

test('login rejects an invalid email before sending a request', () => {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'not-an-email' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});
