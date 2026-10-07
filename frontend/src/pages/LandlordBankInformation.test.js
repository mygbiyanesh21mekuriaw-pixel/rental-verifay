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
  id: 'landlord-id',
  bankName: banks[0].name,
  bankCode: 'CBE',
  accountName: 'Dejen Mulat',
  accountNumberMasked: '*********6789',
  status: 'active',
  balance: 2000,
};

const rentCredit = {
  id: 'credit-1',
  description: 'Rent payment credit',
  tenant: 'Tenant Example',
  property: 'Rental Home',
  amount: 2000,
  currency: 'ETB',
  direction: 'CREDIT',
  status: 'CREDITED',
  externalTransferStatus: 'PENDING',
  payoutMode: 'live',
  payoutReference: 'PO-test-123',
  providerReference: 'CHAPA-payout-123',
  date: '2026-10-07T10:00:00.000Z',
  paymentReference: 'RP-payment-1',
  providerTransactionReference: 'CHAPA-transaction-1',
};

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset().mockImplementation((url) => {
    if (url.endsWith('/banks')) {
      return Promise.resolve({ data: { success: true, banks } });
    }
    return Promise.resolve({ data: { success: true, account: null } });
  });
  axios.post.mockReset();
  useAuth.mockReturnValue({ user: { name: 'Dejen Mulat' } });
});

test('landlord creates an account record with selected bank and personal account details', async () => {
  let savedAccount = null;
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) {
      return Promise.resolve({ data: { success: true, banks } });
    }
    return Promise.resolve({ data: { success: true, account: savedAccount } });
  });
  axios.post.mockImplementation(async (_url, payload) => {
    savedAccount = { ...account, accountName: payload.accountName };
    return { data: { success: true, account: savedAccount } };
  });
  render(<LandlordBankInformation />);

  expect(await screen.findByText('No payout bank account has been registered yet.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create Bank Account' }));
  expect(screen.getByText(/Only supported banks are allowed/)).toBeInTheDocument();

  fireEvent.change(document.getElementById('create-landlord-bank'), { target: { value: 'CBE' } });
  fireEvent.change(document.getElementById('create-landlord-account-name'), { target: { value: 'Dejen Mulat' } });
  fireEvent.change(document.getElementById('create-landlord-account-number'), { target: { value: '100123456789' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/bank-accounts'),
    {
      bankCode: 'CBE',
      bankName: 'Commercial Bank of Ethiopia (CBE)',
      accountName: 'Dejen Mulat',
      accountNumber: '100123456789',
    },
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: expect.any(String) }),
    })
  ));
  expect(await screen.findByText('*********6789')).toBeInTheDocument();
  expect(screen.queryByText('100123456789')).not.toBeInTheDocument();
});

test('shows saved landlord account details with a masked number', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/banks') ? { banks } : { account }),
      },
    })
  ));
  render(<LandlordBankInformation />);

  expect(await screen.findByText('Commercial Bank of Ethiopia (CBE) (CBE)')).toBeInTheDocument();
  expect(screen.getByText('Dejen Mulat')).toBeInTheDocument();
  expect(screen.getByText('*********6789')).toBeInTheDocument();
  expect(screen.getByText('Internal Available Balance')).toBeInTheDocument();
  expect(screen.getByText(
    'This is your internal platform balance, not the balance in your Commercial Bank of Ethiopia (CBE) account. External transfers appear only after Chapa confirms them.'
  )).toBeInTheDocument();
  expect(screen.getByText('ETB 2,000')).toBeInTheDocument();
  expect(screen.queryByLabelText('Account Number')).not.toBeInTheDocument();
});

test('explains that Chapa confirms external transfers before they are marked executed', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/banks') ? { banks } : { account }),
      },
    })
  ));
  render(<LandlordBankInformation />);

  expect(await screen.findByText(
    'Verified live rent payments are submitted to this bank account through Chapa. Sandbox requests are simulations and do not move real bank funds. A transfer is marked executed only after Chapa confirms a live transfer.'
  )).toBeInTheDocument();
  expect(screen.queryByText(
    'Verified rent payments are credited to your internal balance, not transferred to this bank account.'
  )).not.toBeInTheDocument();
});

test('shows persistent internal balance and credited rent transaction history', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({ data: { balance: 2000, currency: 'ETB', transactions: [rentCredit] } });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  expect(await screen.findAllByText('ETB 2,000')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Account Transactions' })).toBeInTheDocument();
  expect(screen.getByText('Rent payment credit')).toBeInTheDocument();
  expect(screen.getByText('Tenant Example')).toBeInTheDocument();
  expect(screen.getByText('Rental Home')).toBeInTheDocument();
  expect(screen.getByText('CHAPA-transaction-1')).toBeInTheDocument();
  expect(screen.getByText('CREDITED')).toBeInTheDocument();
  expect(screen.getByText('PENDING')).toBeInTheDocument();
  expect(screen.getByText('Transfer reference: CHAPA-payout-123')).toBeInTheDocument();
});

test('does not offer demo-bank codes when Chapa payout banks are unavailable', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/bank-accounts/banks')) {
      return Promise.reject({
        response: { status: 503, data: { message: 'Chapa bank list is unavailable.' } },
      });
    }
    return Promise.resolve({ data: { success: true, account: null } });
  });
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Create Bank Account' }));
  expect(await screen.findByText('Chapa bank list is unavailable.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Create Bank Account' })).toBeInTheDocument();
  expect(axios.get).not.toHaveBeenCalledWith(
    expect.stringContaining('/api/bank-accounts/demo/banks'),
    expect.anything()
  );
});

test('landlord can update account details without exposing the current account number', async () => {
  let updatedAccount = account;
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/banks')
          ? { banks }
          : url.endsWith('/my-account/transactions')
            ? { transactions: [] }
            : { account: updatedAccount }),
      },
    })
  ));
  axios.post.mockImplementation(async (_url, payload) => {
    updatedAccount = { ...account, accountName: payload.accountName };
    return {
      data: {
      success: true,
      account: updatedAccount,
      message: 'Landlord payout account saved successfully.',
      },
    };
  });
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const dialog = screen.getByRole('dialog', { name: 'Update Bank Account' });
  expect(dialog).toBeInTheDocument();
  expect(document.getElementById('update-landlord-account-number')).toHaveValue('');
  expect(screen.getByText(/Leave this blank to keep it unchanged/)).toBeInTheDocument();

  fireEvent.change(document.getElementById('update-landlord-account-name'), { target: { value: 'Updated Name' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update Account' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/bank-accounts'),
    {
      bankCode: 'CBE',
      bankName: banks[0].name,
      accountName: 'Updated Name',
    },
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: expect.any(String) }),
    })
  ));
  expect(await screen.findByText('Updated Name')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('reports a bank-account save error without pretending the account was created', async () => {
  axios.post.mockRejectedValue({
    response: { data: { message: 'Account number is invalid.' } },
  });
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Create Bank Account' }));
  fireEvent.change(document.getElementById('create-landlord-bank'), { target: { value: 'CBE' } });
  fireEvent.change(document.getElementById('create-landlord-account-number'), { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Account number is invalid.');
  expect(screen.queryByText('✓ Bank Account Active')).not.toBeInTheDocument();
});
