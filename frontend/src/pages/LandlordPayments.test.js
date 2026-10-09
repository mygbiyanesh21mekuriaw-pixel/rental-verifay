import React from 'react';
import axios from 'axios';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandlordPayments from './LandlordPayments';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

const makePayment = (reference, externalTransferStatus, payoutStatus) => ({
  _id: reference,
  tenant: { name: 'Tenant Example' },
  property: { title: 'Rental Home' },
  amount: 3000,
  currency: 'ETB',
  paymentPeriod: 'October 2026',
  createdAt: '2026-10-07T10:00:00.000Z',
  status: 'paid',
  provider: 'chapa',
  providerTransactionReference: `CHAPA-${reference}`,
  verifiedAt: '2026-10-07T10:00:00.000Z',
  isVerified: true,
  landlordCreditStatus: 'CREDITED',
  externalTransferStatus,
  payout: {
    status: payoutStatus,
    mode: 'live',
    providerReference: `PO-${reference}`,
    payoutReference: `PO-${reference}`,
    providerVerificationResponse: { reference: `PO-${reference}` },
  },
});

const expectRentPaymentTableColumns = async () => {
  const table = await screen.findByRole('table');
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    'Tenant',
    'Property',
    'Amount',
    'Period',
    'Date',
    'Payment Status',
    'Provider',
    'Chapa Transaction Reference',
    'Verified',
    'Landlord Credit',
  ]);
  within(table).getAllByRole('row').slice(1).forEach((row) => {
    expect(within(row).getAllByRole('cell')).toHaveLength(10);
  });
  expect(within(table).queryByText(/External Bank Transfer|NOT EXECUTED|PENDING|EXECUTED|Sandbox simulation:|Chapa submission:|Chapa verification:/))
    .not.toBeInTheDocument();
};

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset().mockResolvedValue({
    data: [
      makePayment('pending', 'PENDING', 'PROCESSING'),
      makePayment('executed', 'EXECUTED', 'PAID'),
      makePayment('failed', 'FAILED', 'FAILED'),
    ],
  });
});

test('Rent Payments keeps payment and landlord credit details without external transfer column', async () => {
  render(
    <MemoryRouter>
      <LandlordPayments />
    </MemoryRouter>
  );

  await expectRentPaymentTableColumns();
  expect(screen.getAllByText('Tenant Example')).toHaveLength(3);
  expect(screen.getAllByText('Rental Home')).toHaveLength(3);
  expect(screen.getAllByText('ETB 3,000')).toHaveLength(3);
  expect(screen.getAllByText('Paid')).toHaveLength(3);
  expect(screen.getAllByText('October 2026')).toHaveLength(3);
  expect(screen.getAllByText('chapa')).toHaveLength(3);
  expect(screen.getAllByText('Not verified')).toHaveLength(3);
  expect(screen.getAllByText('CREDITED')).toHaveLength(3);
  expect(screen.getByText(/EXECUTED only after Chapa confirms a live transfer/i)).toBeInTheDocument();
});

test('Rent Payments hides external transfer status and reasons without changing payment data', async () => {
  axios.get.mockResolvedValueOnce({
    data: [{
      ...makePayment('legacy', 'NOT_EXECUTED', null),
      payout: {
        status: 'NOT_SUBMITTED',
        failureReason: 'Payment mode was not recorded; no landlord payout was submitted.',
      },
    }],
  });
  render(
    <MemoryRouter>
      <LandlordPayments />
    </MemoryRouter>
  );

  await expectRentPaymentTableColumns();
  expect(screen.getByText('Tenant Example')).toBeInTheDocument();
  expect(screen.getByText('Not verified')).toBeInTheDocument();
  expect(screen.getByText('CREDITED')).toBeInTheDocument();
});

test('Rent Payments hides sandbox transfer details while keeping payment information', async () => {
  axios.get.mockResolvedValueOnce({
    data: [{
      ...makePayment('sandbox', 'NOT_EXECUTED', 'SIMULATED'),
      payout: {
        status: 'SIMULATED',
        mode: 'sandbox',
        sandboxTransferStatus: 'SUCCEEDED',
        payoutReference: 'PO-sandbox',
        providerReference: 'PO-sandbox',
      },
    }],
  });
  render(
    <MemoryRouter>
      <LandlordPayments />
    </MemoryRouter>
  );

  await expectRentPaymentTableColumns();
  expect(screen.getByText('Not verified')).toBeInTheDocument();
  expect(screen.getByText('CREDITED')).toBeInTheDocument();
});
