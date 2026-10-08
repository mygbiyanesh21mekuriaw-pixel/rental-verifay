import React from 'react';
import axios from 'axios';
import { render, screen } from '@testing-library/react';
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

test('Rent Payments displays confirmed payout statuses and Chapa references', async () => {
  render(
    <MemoryRouter>
      <LandlordPayments />
    </MemoryRouter>
  );

  expect(await screen.findByText('PENDING')).toBeInTheDocument();
  expect(screen.getByText('EXECUTED')).toBeInTheDocument();
  expect(screen.getByText('FAILED')).toBeInTheDocument();
  expect(screen.getByText('Payout reference: PO-executed')).toBeInTheDocument();
  expect(screen.getByText('Chapa transfer reference: PO-executed')).toBeInTheDocument();
  expect(screen.queryByText('Payout reference: PO-pending')).not.toBeInTheDocument();
  expect(screen.queryByText('Chapa transfer reference: PO-pending')).not.toBeInTheDocument();
  expect(screen.queryByText('Payout reference: PO-failed')).not.toBeInTheDocument();
  expect(screen.queryByText('Chapa transfer reference: PO-failed')).not.toBeInTheDocument();
  expect(screen.getAllByText('CREDITED')).toHaveLength(3);
  expect(screen.getByText(/EXECUTED only after Chapa confirms a live transfer/i)).toBeInTheDocument();
});

test('Rent Payments displays a backend reason when no payout was submitted', async () => {
  const reason = 'Payment mode was not recorded; no landlord payout was submitted.';
  axios.get.mockResolvedValueOnce({
    data: [{
      ...makePayment('legacy', 'NOT_EXECUTED', null),
      payout: {
        status: 'NOT_SUBMITTED',
        failureReason: reason,
      },
    }],
  });
  render(
    <MemoryRouter>
      <LandlordPayments />
    </MemoryRouter>
  );

  expect(await screen.findByText('NOT EXECUTED')).toBeInTheDocument();
  expect(screen.getByText(reason)).toBeInTheDocument();
});

test('Rent Payments hides payout references for sandbox simulations marked not executed', async () => {
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

  expect(await screen.findByText('NOT EXECUTED')).toBeInTheDocument();
  expect(screen.queryByText('Payout reference: PO-sandbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Chapa transfer reference: PO-sandbox')).not.toBeInTheDocument();
});
