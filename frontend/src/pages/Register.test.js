import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
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

test('registration requires a username before sending the request', () => {
  const { container } = render(
    <MemoryRouter>
      <AuthProvider>
        <Register />
      </AuthProvider>
    </MemoryRouter>
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
