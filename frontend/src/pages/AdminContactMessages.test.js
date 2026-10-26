import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminContactMessages from './AdminContactMessages';

jest.mock('axios', () => ({
  get: jest.fn(),
  put: jest.fn(),
}));

const messages = [{
  _id: 'contact-1',
  name: 'Aster User',
  email: 'aster@example.com',
  subject: 'Rental question',
  message: 'I need help with a rental listing.',
  createdAt: '2026-10-15T10:00:00.000Z',
  read: false,
}];

beforeEach(() => {
  localStorage.setItem('token', 'platform-admin-token');
  axios.get.mockReset().mockResolvedValue({ data: messages });
  axios.put.mockReset().mockResolvedValue({ data: { ...messages[0], read: true } });
});

test('shows Contact Us submissions in the Area Admin inbox', async () => {
  render(
    <MemoryRouter>
      <AdminContactMessages />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: 'Rental question' })).toBeInTheDocument();
  expect(screen.getByText('I need help with a rental listing.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'aster@example.com' })).toHaveAttribute(
    'href',
    'mailto:aster@example.com',
  );
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/contact/area-admin/inbox'),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer platform-admin-token' }),
    }),
  );
});

test('marks an inbox message as read', async () => {
  render(
    <MemoryRouter>
      <AdminContactMessages />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/contact/area-admin/inbox/contact-1/read'),
    {},
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer platform-admin-token' }),
    }),
  ));
  expect(await screen.findByText('Read')).toBeInTheDocument();
});
