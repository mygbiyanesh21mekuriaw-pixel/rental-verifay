import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Contact from './ContactUs';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

beforeEach(() => {
  axios.get.mockResolvedValue({ data: [{ _id: 'north', name: 'North' }] });
});

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (text) => text }),
}));

jest.mock('../context/SystemStatusContext', () => ({
  useSystemStatus: () => ({
    status: {
      branding: {
        websiteName: 'RentalVerify Portal',
        contactEmail: 'support@example.com',
        contactPhone: '+251 911 123456',
        contactAddress: 'Addis Ababa',
      },
    },
  }),
}));

test('displays the configured website name and contact information', async () => {
  axios.post.mockReset();
  render(<Contact />);
  await screen.findByRole('option', { name: 'North' });

  expect(screen.getByText('Addis Ababa')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'support@example.com' })).toHaveAttribute(
    'href',
    'mailto:support@example.com',
  );
  expect(screen.getByRole('link', { name: '+251 911 123456' })).toHaveAttribute(
    'href',
    'tel:+251 911 123456',
  );
  expect(screen.getByText(/RentalVerify Portal is an academic student project/)).toBeInTheDocument();
});

test('submits the contact message and shows confirmation', async () => {
  axios.post.mockResolvedValue({
    data: { message: 'Your message was saved in the Platform Admin contact inbox.' },
  });
  render(<Contact />);
  await screen.findByRole('option', { name: 'North' });

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Aster User' } });
  fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), { target: { value: 'aster@example.com' } });
  fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'North' } });
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Rental question' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'I have a question about a rental.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/contact', {
    name: 'Aster User',
    email: 'aster@example.com',
    area: 'North',
    subject: 'Rental question',
    message: 'I have a question about a rental.',
  }));
  expect(await screen.findByRole('status'))
    .toHaveTextContent('Your message was saved in the Platform Admin contact inbox.');
});

test('displays the server error when a contact message cannot be sent', async () => {
  axios.post.mockRejectedValue({
    response: { data: { message: 'Unable to send your message right now.' } },
  });
  render(<Contact />);
  await screen.findByRole('option', { name: 'North' });

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Aster User' } });
  fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), { target: { value: 'aster@example.com' } });
  fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'North' } });
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Rental question' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'I have a question about a rental.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to send your message right now.');
});
