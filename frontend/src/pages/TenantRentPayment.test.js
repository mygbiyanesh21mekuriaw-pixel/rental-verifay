import React from 'react';
import axios from 'axios';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandlordPayments from './LandlordPayments';
import TenantRentPayment from './TenantRentPayment';
import { createReceiptPdf, isVerifiedPayment } from './TenantRentPayment';

jest.mock('axios', () => ({
  get: jest.fn(),
}));

const verifiedPayment = {
  _id: 'payment-1',
  isVerified: true,
  status: 'paid',
  verifiedAt: '2026-10-05T12:00:00.000Z',
  provider: 'chapa',
  providerTransactionReference: 'CHAPA-transaction-1',
  paymentReference: 'RP-payment-1',
  paymentPeriod: '2026-10',
  currency: 'ETB',
  amount: 2500,
  tenant: { name: 'Tenant Example' },
  landlord: { name: 'Landlord Example' },
  property: { title: 'Rental Home' },
};

const tenantPaymentContext = {
  property: { _id: 'property-1', title: 'Rental Home', location: 'Addis Ababa', price: 2500 },
  landlord: { name: 'Landlord Example' },
  landlordBankInformationComplete: true,
  payments: [verifiedPayment],
  currentPayment: verifiedPayment,
};

const renderTenantPayment = () => render(
  <MemoryRouter initialEntries={['/tenant/rent-payment/property-1']}>
    <Routes>
      <Route path="/tenant/rent-payment/:propertyId" element={<TenantRentPayment />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  axios.get.mockReset();
});

test('only a verified paid payment can be used for a receipt', () => {
  expect(isVerifiedPayment(verifiedPayment)).toBe(true);
  expect(isVerifiedPayment({ ...verifiedPayment, isVerified: false })).toBe(false);
  expect(isVerifiedPayment({ ...verifiedPayment, verifiedAt: null })).toBe(false);
  expect(isVerifiedPayment({ ...verifiedPayment, providerTransactionReference: '' })).toBe(false);
  expect(isVerifiedPayment({ ...verifiedPayment, status: 'pending' })).toBe(false);
});

test('creates a PDF receipt only from verified backend payment data', () => {
  const pdf = createReceiptPdf(verifiedPayment);
  expect(pdf).toBeInstanceOf(Blob);
  expect(pdf.type).toBe('application/pdf');
  expect(pdf.size).toBeGreaterThan(500);
  expect(createReceiptPdf({ ...verifiedPayment, isVerified: false })).toBeNull();
});

test('prints the selected verified receipt', async () => {
  axios.get.mockResolvedValue({ data: tenantPaymentContext });
  Object.defineProperty(window, 'print', {
    configurable: true,
    value: jest.fn(),
  });
  renderTenantPayment();
  fireEvent.click(await screen.findByRole('button', { name: 'Print Receipt' }));

  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 120));
  });

  expect(window.print).toHaveBeenCalledTimes(1);
});

test('tenant rent payment screen never asks for landlord bank information', async () => {
  axios.get.mockResolvedValue({ data: tenantPaymentContext });
  renderTenantPayment();

  expect(await screen.findByRole('heading', { name: 'Pay Rent' })).toBeInTheDocument();
  expect(screen.queryByLabelText(/bank/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/account name/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/account number/i)).not.toBeInTheDocument();
});

test('tenant receives a clear message when landlord has not created a demo account', async () => {
  axios.get.mockResolvedValue({
    data: {
      ...tenantPaymentContext,
      landlordBankInformationComplete: false,
      landlordBankInformationMessage: 'The landlord has not created an active demo bank account. Please contact the landlord before paying rent.',
    },
  });
  renderTenantPayment();

  expect(await screen.findByText(/has not created an active demo bank account/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pay Rent' })).toBeDisabled();
});

test('downloads a PDF from the verified receipt', async () => {
  axios.get.mockResolvedValue({ data: tenantPaymentContext });
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const createObjectUrl = jest.fn(() => 'blob:rent-receipt');
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  renderTenantPayment();
  fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));

  expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf' }));
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl });
  } else {
    delete URL.createObjectURL;
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl });
  } else {
    delete URL.revokeObjectURL;
  }
});

test('shows landlord payment, verification, provider reference, and payout statuses', async () => {
  axios.get.mockResolvedValue({
    data: [{
      ...verifiedPayment,
      tenant: { name: 'Tenant Example' },
      property: { title: 'Rental Home' },
      provider: 'chapa',
      chapaTransactionReference: 'CHAPA-transaction-1',
      payoutStatus: 'PROCESSING',
      payout: { status: 'PROCESSING' },
    }],
  });
  render(
    <MemoryRouter>
      <LandlordPayments />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText('CHAPA-transaction-1')).toBeInTheDocument());
  expect(screen.getByText('Paid')).toBeInTheDocument();
  expect(screen.getByText('PROCESSING')).toBeInTheDocument();
  expect(screen.getByText(/^Yes ·/)).toBeInTheDocument();
});
