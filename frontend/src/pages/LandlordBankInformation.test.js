import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LandlordBankInformation from './LandlordBankInformation';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const banks = [
  { code: 'CBE', name: 'Commercial Bank of Ethiopia (CBE)' },
  { code: 'AWASH', name: 'Awash Bank' },
];
const account = {
  id: 'account-1',
  bankName: banks[0].name,
  bankCode: 'CBE',
  accountName: 'Dejen Mulat',
  accountNumber: '1000000000001',
  balance: 0,
  status: 'active',
};

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset().mockImplementation((url) => {
    if (url.endsWith('/demo/banks')) return Promise.resolve({ data: banks });
    if (url.endsWith('/my-account/transactions')) return Promise.resolve({ data: { transactions: [] } });
    return Promise.resolve({ data: { account: null } });
  });
  axios.post.mockReset();
  useAuth.mockReturnValue({ user: { name: 'Dejen Mulat' } });
});

test('first-time landlord can create one demo account using their profile name', async () => {
  let currentAccount = null;
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/demo/banks')) return Promise.resolve({ data: banks });
    if (url.endsWith('/my-account/transactions')) return Promise.resolve({ data: { transactions: [] } });
    return Promise.resolve({ data: { account: currentAccount } });
  });
  axios.post.mockImplementation(async () => {
    currentAccount = account;
    return {
      data: {
        message: 'Your demo bank account is now active.',
        account,
      },
    };
  });
  render(<LandlordBankInformation />);

  expect(await screen.findByText(/This account is created inside the Rental Verification Portal/)).toBeInTheDocument();
  expect(screen.getByText(/It is NOT a real bank account/)).toBeInTheDocument();
  expect(await screen.findByText("You don't have a demo bank account configured yet.")).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('/api/bank-accounts/my-account'),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: expect.any(String) }),
    })
  );
  const bankSelect = await screen.findByLabelText('Bank');
  expect(screen.getByLabelText('Account Name')).toHaveValue('Dejen Mulat');
  expect(screen.getByLabelText('Account Name')).toHaveAttribute('readonly');
  expect(screen.queryByLabelText(/account number/i)).not.toBeInTheDocument();

  fireEvent.change(bankSelect, { target: { value: 'CBE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Demo Bank Account' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/bank-accounts/demo'),
    { bankCode: 'CBE' },
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }),
    })
  ));
});

test('shows the active account, credited balance, and payment history', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/demo/banks')) return Promise.resolve({ data: banks });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          transactions: [{
            id: 'transaction-1',
            creditedAt: '2026-10-06T10:00:00.000Z',
            tenant: 'Selam Alemu',
            property: '2 Bedroom House',
            amount: 5000,
            currency: 'ETB',
            paymentStatus: 'Paid',
            creditedTo: account.accountNumber,
          }],
        },
      });
    }
    return Promise.resolve({ data: { account: { ...account, balance: 5000 } } });
  });
  render(<LandlordBankInformation />);

  expect((await screen.findAllByText('1000000000001')).length).toBeGreaterThan(0);
  expect(screen.getByText('DEMO ACCOUNT NUMBER:')).toBeInTheDocument();
  expect(screen.getByText('5000.00 ETB')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByText('Selam Alemu')).toBeInTheDocument();
  expect(screen.getByText('2 Bedroom House')).toBeInTheDocument();
  expect(screen.getByText('ETB 5,000')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create Demo Bank Account' })).not.toBeInTheDocument();
});

test('shows a user-friendly account creation error', async () => {
  axios.post.mockRejectedValue({
    response: { data: { message: 'Your demo bank account is already registered.' } },
  });
  render(<LandlordBankInformation />);
  fireEvent.change(await screen.findByLabelText('Bank'), { target: { value: 'CBE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Demo Bank Account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your demo bank account is already registered.');
});

test('explains that a missing backend demo route requires restarting the backend', async () => {
  axios.get.mockRejectedValue({
    response: { status: 404, data: '<html>Cannot GET /api/bank-accounts/my-account</html>' },
  });
  render(<LandlordBankInformation />);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The demo bank API route was not found. Restart the backend server and try again.'
  );
});
