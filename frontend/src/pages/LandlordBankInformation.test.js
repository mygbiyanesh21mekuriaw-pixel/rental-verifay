import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LandlordBankInformation from './LandlordBankInformation';
import { useAuth } from '../context/AuthContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
    )),
  }),
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
  paymentPeriod: '2026-10',
  direction: 'CREDIT',
  status: 'CREDITED',
  externalTransferStatus: 'PENDING',
  payoutStatus: 'PROCESSING',
  payoutMode: 'live',
  payoutReference: 'PO-test-123',
  providerReference: 'PO-test-123',
  providerRequestResponse: {
    httpStatus: 200,
    apiStatus: 'success',
    message: 'Transfer accepted',
  },
  providerVerificationResponse: {
    httpStatus: 200,
    apiStatus: 'success',
    status: 'pending',
    message: 'Transfer is pending',
  },
  payoutFailureReason: 'Chapa transfer is still pending confirmation.',
  date: '2026-10-07T10:00:00.000Z',
  paymentReference: 'RP-payment-1',
  providerTransactionReference: 'CHAPA-transaction-1',
};

const expectTransactionsTableColumns = async () => {
  const table = await screen.findByRole('table');
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    'Date',
    'Period',
    'Tenant',
    'Property',
    'Amount',
    'Type',
    'Status',
    'Reference',
  ]);
  within(table).getAllByRole('row').slice(1).forEach((row) => {
    expect(within(row).getAllByRole('cell')).toHaveLength(8);
  });
  expect(within(table).queryByText('External Transfer')).not.toBeInTheDocument();
  expect(within(table).queryByText(/NOT EXECUTED|PENDING|EXECUTED|Sandbox only|Chapa submission:|Chapa verification:/))
    .not.toBeInTheDocument();
  const referenceDetails = within(table).queryByText('View reference details');
  if (referenceDetails) fireEvent.click(referenceDetails);
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
  expect(screen.getByText('Available balance')).toBeInTheDocument();
  expect(screen.getByText('Internal balance')).toBeInTheDocument();
  expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  expect(document.querySelector('.bank-account-details p')).toBeNull();
  expect(screen.getByText('ETB 2,000')).toBeInTheDocument();
  expect(screen.queryByLabelText('Account Number')).not.toBeInTheDocument();
});

test('loads Chapa bank names and codes into the update bank selector', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/banks') ? { banks } : { account }),
      },
    })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const bankSelect = document.getElementById('update-landlord-bank');
  await waitFor(() => expect(bankSelect).toHaveTextContent('Commercial Bank of Ethiopia (CBE) (CBE)'));
  expect(bankSelect).toHaveTextContent('Awash Bank (AWASH)');
});

test('accepts the direct bank-array response from the existing Chapa banks API', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: url.endsWith('/banks') ? banks : { success: true, account },
    })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  expect(document.getElementById('update-landlord-bank')).toHaveTextContent('Commercial Bank of Ethiopia (CBE) (CBE)');
  expect(document.getElementById('update-landlord-bank')).toHaveTextContent('Awash Bank (AWASH)');
  expect(screen.getByRole('button', { name: 'Update Account' })).toBeEnabled();
});

test.each([
  ['nested data array', { data: { data: banks } }],
  ['nested data banks', { data: { data: { banks } } }],
  ['bank API wrapper', { data: { data: { success: true, banks } } }],
])('normalizes %s and shows the supported banks', async (_shape, response) => {
  axios.get.mockImplementation((url) => (
    Promise.resolve(url.endsWith('/banks')
      ? response
      : { data: { success: true, account } })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const bankSelect = document.getElementById('update-landlord-bank');
  expect(bankSelect).toHaveTextContent('Commercial Bank of Ethiopia (CBE) (CBE)');
  expect(bankSelect).toHaveTextContent('Awash Bank (AWASH)');
});

test('normalizes Chapa bank id and label fields into a selectable code and name', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve(url.endsWith('/banks')
      ? { data: { message: 'Banks retrieved', data: [{ id: 946, label: 'Commercial Bank of Ethiopia (CBE)' }] } }
      : { data: { success: true, account: { ...account, bankCode: '946' } } })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const bankSelect = document.getElementById('update-landlord-bank');
  expect(bankSelect).toHaveTextContent('Commercial Bank of Ethiopia (CBE) (946)');
  expect(bankSelect).toHaveValue('946');
});

test('excludes Chapa banks that explicitly do not support payouts', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve(url.endsWith('/banks')
      ? {
        data: {
          banks: [
            { id: 946, name: 'Commercial Bank of Ethiopia (CBE)', can_process_payouts: 1 },
            { id: 687, name: 'Payout-disabled bank', can_process_payouts: 0 },
          ],
        },
      }
      : { data: { success: true, account } })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const bankSelect = document.getElementById('update-landlord-bank');
  expect(bankSelect).toHaveTextContent('Commercial Bank of Ethiopia (CBE) (946)');
  expect(bankSelect).not.toHaveTextContent('Payout-disabled bank');
});

test('requires a new account number when the saved encrypted number cannot be recovered', async () => {
  const accountNeedsUpdate = {
    ...account,
    bankAccountConfigured: false,
    bankAccountNeedsUpdate: true,
    accountNumberMasked: '',
    status: 'inactive',
  };
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({ data: { transactions: [] } });
    }
    return Promise.resolve({ data: { success: true, account: accountNeedsUpdate } });
  });

  render(<LandlordBankInformation />);

  expect(await screen.findByText('Please update your bank account number')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Update Bank Account' }));
  const accountNumberInput = document.getElementById('update-landlord-account-number');
  expect(accountNumberInput).toBeRequired();
  expect(accountNumberInput).toHaveAttribute('placeholder', 'Enter account number');
});

test('shows active bank status in the account card without a separate active banner', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/banks') ? { banks } : { account }),
      },
    })
  ));
  render(<LandlordBankInformation />);

  expect(await screen.findByText('Active')).toBeInTheDocument();
  expect(document.querySelector('.bank-account-status')).toHaveTextContent('Active');
  expect(document.querySelector('.bank-account-active-banner')).toBeNull();
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
  await expectTransactionsTableColumns();
  expect(within(screen.getByRole('table')).getByText('2026-10')).toBeInTheDocument();
  expect(screen.getByText('Tenant Example')).toBeInTheDocument();
  expect(screen.getByText('Rental Home')).toBeInTheDocument();
  expect(screen.getByText('Payout: PO-test-123')).toBeInTheDocument();
  expect(screen.getByText('Rent payment: RP-payment-1')).toBeInTheDocument();
  expect(screen.getByText('Chapa payment: CHAPA-transaction-1')).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getByText('CREDITED')).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getAllByText('Credit')).toHaveLength(1);
  expect(screen.queryByText('Payout reference: PO-test-123')).not.toBeInTheDocument();
  expect(screen.queryByText('Chapa transfer reference: PO-test-123')).not.toBeInTheDocument();
});

test('filters loaded transactions by search, period, type, and status and paginates results', async () => {
  const transactions = Array.from({ length: 12 }, (_value, index) => ({
    ...rentCredit,
    id: `credit-${index + 1}`,
    tenant: index === 11 ? 'Filtered Tenant' : `Tenant ${index + 1}`,
    property: `Property ${index + 1}`,
    paymentPeriod: index === 11 ? '2026-09' : '2026-10',
    direction: index === 11 ? 'DEBIT' : 'CREDIT',
    status: index === 11 ? 'PENDING' : 'CREDITED',
    paymentReference: `REF-${index + 1}`,
    providerTransactionReference: undefined,
    payoutReference: undefined,
  }));
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({ data: { transactions } });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  const table = await screen.findByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  const rowsPerPage = screen.getByLabelText('Rows per page');
  expect(Array.from(rowsPerPage.options).map((option) => option.value)).toEqual(['10', '25', '50']);
  fireEvent.change(rowsPerPage, { target: { value: '25' } });
  expect(within(table).getAllByRole('row')).toHaveLength(13);
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'REF-12' } });
  fireEvent.change(screen.getByLabelText('Period'), { target: { value: '2026-09' } });
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'debit' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PENDING' } });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).getByText('Filtered Tenant')).toBeInTheDocument();
  expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument();
});

test('copies one shortened reference and reveals the full reference set on demand', async () => {
  const fullReference = 'RP-reference-with-a-long-sensitive-value';
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          transactions: [{
            ...rentCredit,
            paymentReference: fullReference,
          }],
        },
      });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  const table = await screen.findByRole('table');
  expect(within(table).getByText('RP-refere…e-value')).toBeInTheDocument();
  expect(within(table).queryByText(`Rent payment: ${fullReference}`)).not.toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button', { name: 'Copy reference RP-refere…e-value' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(fullReference));
  expect(await screen.findByText('Reference copied.')).toBeInTheDocument();
  fireEvent.click(within(table).getByText('View reference details'));
  expect(within(table).getByText(`Rent payment: ${fullReference}`)).toBeInTheDocument();
  expect(within(table).getByText('Chapa payment: CHAPA-transaction-1')).toBeInTheDocument();
  expect(within(table).getByText('Payout: PO-test-123')).toBeInTheDocument();
});

test('hides external transfer status and retry controls while retaining transaction data', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          balance: 2000,
          currency: 'ETB',
          transactions: [{
            ...rentCredit,
            payoutStatus: 'PROCESSING',
            payoutMode: 'sandbox',
            externalTransferStatus: 'NOT_EXECUTED',
            sandboxTransferStatus: 'PROCESSING',
            transferAttemptedAt: '2026-10-07T10:00:00.000Z',
            payoutFailureReason: 'Chapa test-mode verification amount was omitted; the payout remains unconfirmed.',
          }],
        },
      });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  await expectTransactionsTableColumns();
  expect(within(screen.getByRole('table')).getByText('CREDITED')).toBeInTheDocument();
  expect(screen.getByText('Rent payment: RP-payment-1')).toBeInTheDocument();
  expect(screen.getByText('Payout: PO-test-123')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry verification' })).not.toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test('keeps external-transfer status separate from reasons and clarifies sandbox results are not bank transfers', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          balance: 2000,
          currency: 'ETB',
          transactions: [{
            ...rentCredit,
            externalTransferStatus: 'NOT_EXECUTED',
            payoutMode: 'sandbox',
            payoutStatus: 'PAID',
            sandboxTransferStatus: null,
            payoutFailureReason: 'Sandbox verification reported success.',
          }],
        },
      });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  await expectTransactionsTableColumns();
  expect(screen.getByText('Payout: PO-test-123')).toBeInTheDocument();
});

test('shows Chapa response details for a failed sandbox simulation without treating it as a real payout failure', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          balance: 2000,
          currency: 'ETB',
          transactions: [{
            ...rentCredit,
            externalTransferStatus: 'NOT_EXECUTED',
            payoutMode: 'sandbox',
            payoutStatus: 'SIMULATED',
            sandboxTransferStatus: 'FAILED',
            payoutFailureReason: 'Invalid sandbox destination account.',
            providerRequestResponse: {
              apiStatus: 'error',
              httpStatus: 400,
              message: 'Invalid sandbox destination account.',
            },
          }],
        },
      });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  await expectTransactionsTableColumns();
  expect(screen.getByText('Payout: PO-test-123')).toBeInTheDocument();
});

test('shows why an unconfirmed sandbox transfer remains processing', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          balance: 2000,
          currency: 'ETB',
          transactions: [{
            ...rentCredit,
            externalTransferStatus: 'NOT_EXECUTED',
            payoutMode: 'sandbox',
            payoutStatus: 'PROCESSING',
            sandboxTransferStatus: 'PROCESSING',
            providerRequestResponse: {
              apiStatus: 'success',
              httpStatus: 200,
              message: 'Transfer queued successfully in Test Mode.',
            },
            providerVerificationResponse: {
              apiStatus: 'success',
              httpStatus: 200,
              status: 'success',
              message: 'Transfer details (Test Mode)',
            },
            payoutFailureReason: 'Chapa test-mode verification reference was omitted, amount was omitted, and currency was omitted; the payout remains unconfirmed.',
          }],
        },
      });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  await expectTransactionsTableColumns();
  expect(screen.getByText('Payout: PO-test-123')).toBeInTheDocument();
});

test('shows when a sandbox payout was not submitted because no test destination is configured', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          balance: 2000,
          currency: 'ETB',
          transactions: [{
            ...rentCredit,
            externalTransferStatus: 'NOT_EXECUTED',
            payoutMode: 'sandbox',
            payoutStatus: 'PENDING',
            sandboxTransferStatus: null,
            providerRequestResponse: null,
            providerVerificationResponse: null,
            payoutFailureReason: 'Sandbox payout was not submitted. Configure CHAPA_TRANSFER_TEST_ACCOUNT_NUMBER with a test destination supplied by Chapa; the saved landlord account is not sent in sandbox mode.',
          }],
        },
      });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  await expectTransactionsTableColumns();
  expect(screen.getByText('Payout: PO-test-123')).toBeInTheDocument();
});

test('shows saved payout and payment references independently of transfer execution status', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/banks')) return Promise.resolve({ data: { success: true, banks } });
    if (url.endsWith('/my-account/transactions')) {
      return Promise.resolve({
        data: {
          balance: 2000,
          currency: 'ETB',
          transactions: [{
            ...rentCredit,
            externalTransferStatus: 'EXECUTED',
            payoutStatus: 'PAID',
          }],
        },
      });
    }
    return Promise.resolve({ data: { success: true, account } });
  });
  render(<LandlordBankInformation />);

  await expectTransactionsTableColumns();
  expect(screen.getByText('Payout: PO-test-123')).toBeInTheDocument();
  expect(screen.getByText('Rent payment: RP-payment-1')).toBeInTheDocument();
  expect(screen.getByText('Chapa payment: CHAPA-transaction-1')).toBeInTheDocument();
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
  expect(document.getElementById('update-landlord-bank')).toHaveValue('CBE');
  expect(document.getElementById('update-landlord-account-name')).toHaveValue('Dejen Mulat');
  expect(screen.getByText(/Leave this blank to keep it unchanged/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Update Account' })).toBeEnabled();

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

test('selecting a supported bank allows an account update while keeping the saved number masked', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/banks') ? { banks } : { account }),
      },
    })
  ));
  axios.post.mockResolvedValue({
    data: { message: 'Landlord payout account saved successfully.' },
  });
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  fireEvent.change(document.getElementById('update-landlord-bank'), { target: { value: 'AWASH' } });
  fireEvent.change(document.getElementById('update-landlord-account-number'), { target: { value: '1234567890' } });

  expect(document.getElementById('update-landlord-account-name')).toHaveValue('Dejen Mulat');
  expect(document.getElementById('update-landlord-account-number')).toHaveValue('1234567890');
  expect(screen.getByRole('button', { name: 'Update Account' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Update Account' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/bank-accounts'),
    {
      bankCode: 'AWASH',
      bankName: 'Awash Bank',
      accountName: 'Dejen Mulat',
      accountNumber: '1234567890',
    },
    expect.anything()
  ));
});

test('requires a supported bank and valid account details before enabling update', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/banks') ? { banks } : { account }),
      },
    })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const bankSelect = document.getElementById('update-landlord-bank');
  const updateButton = screen.getByRole('button', { name: 'Update Account' });
  fireEvent.change(bankSelect, { target: { value: '' } });
  expect(updateButton).toBeDisabled();
  fireEvent.change(bankSelect, { target: { value: 'NOT-SUPPORTED' } });
  expect(updateButton).toBeDisabled();
  fireEvent.change(bankSelect, { target: { value: 'CBE' } });
  fireEvent.change(document.getElementById('update-landlord-account-name'), { target: { value: ' ' } });
  expect(updateButton).toBeDisabled();
});

test('shows a bank API failure inside the update modal and keeps the bank invalid', async () => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/bank-accounts/banks')) {
      return Promise.reject({
        response: { status: 503, data: { message: 'Chapa bank list is unavailable.' } },
      });
    }
    return Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/my-account/transactions') ? { transactions: [] } : { account }),
      },
    });
  });
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const dialog = screen.getByRole('dialog', { name: 'Update Bank Account' });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Chapa bank list is unavailable.');
  expect(document.getElementById('update-landlord-bank')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Update Account' })).toBeDisabled();
});

test.each([
  [401, 'The server rejected the request.', 'Your session has expired. Please log in again.'],
  [403, 'The server rejected the request.', 'Only landlord accounts can load Chapa-supported banks.'],
  [500, 'Chapa bank service failed.', 'Chapa bank service failed.'],
])('shows an actionable message when the bank API returns HTTP %s', async (status, apiMessage, expectedMessage) => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/bank-accounts/banks')) {
      return Promise.reject({ response: { status, data: { message: apiMessage } } });
    }
    return Promise.resolve({
      data: {
        success: true,
        ...(url.endsWith('/my-account/transactions') ? { transactions: [] } : { account }),
      },
    });
  });
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const dialog = screen.getByRole('dialog', { name: 'Update Bank Account' });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(expectedMessage);
  expect(screen.getByRole('button', { name: 'Update Account' })).toBeDisabled();
});

test('shows a connection-specific bank API error when the backend is unreachable', async () => {
  axios.get.mockImplementation((url) => (
    url.endsWith('/api/bank-accounts/banks')
      ? Promise.reject(new Error('Network Error'))
      : Promise.resolve({
        data: {
          success: true,
          ...(url.endsWith('/my-account/transactions') ? { transactions: [] } : { account }),
        },
      })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const dialog = screen.getByRole('dialog', { name: 'Update Bank Account' });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Unable to reach the backend to load Chapa-supported banks. Check your connection and retry.'
  );
  expect(screen.getByRole('button', { name: 'Update Account' })).toBeDisabled();
});

test('shows a clear error when the bank API success payload contains no valid banks', async () => {
  axios.get.mockImplementation((url) => (
    Promise.resolve(url.endsWith('/banks')
      ? { data: { success: true, message: 'Banks retrieved', data: [{ id: 946 }] } }
      : { data: { success: true, account } })
  ));
  render(<LandlordBankInformation />);

  fireEvent.click(await screen.findByRole('button', { name: 'Update Bank Account' }));
  const dialog = screen.getByRole('dialog', { name: 'Update Bank Account' });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Unable to load Chapa-supported banks. The bank list response contained no valid bank names and codes.'
  );
  expect(document.getElementById('update-landlord-bank')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Update Account' })).toBeDisabled();
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
