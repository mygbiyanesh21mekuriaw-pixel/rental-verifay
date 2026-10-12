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

test('embeds the bank logo and name in a PDF receipt created from verified payment data', async () => {
  const logoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = createReceiptPdf(verifiedPayment, logoBytes);
  expect(pdf).toBeInstanceOf(Blob);
  expect(pdf.type).toBe('application/pdf');
  expect(pdf.size).toBeGreaterThan(500);
  expect(createReceiptPdf({ ...verifiedPayment, isVerified: false }, logoBytes)).toBeNull();
  expect(createReceiptPdf(verifiedPayment)).toBeNull();
  const pdfBytes = await readBlobBytes(pdf);
  const pdfText = Array.from(pdfBytes, byte =>String.fromCharCode(byte)).join('');
  expect(pdfText).not.toContain('(Commercial Bank of Ethiopia) Tj');
  expect(pdfText).not.toContain('(HOUSE RENTAL MANAGEMENT SYSTEM) Tj');
  expect(pdfText).toContain('340 0 0 68 54 772 cm');
  expect(pdfText).toContain('(RENT PAYMENT RECEIPT) Tj');
  expect(pdfText).toContain('/Subtype /Image');
  expect(pdfText).toContain('/Filter /DCTDecode');
  expect(pdfBytes).toContain(0xff);
});

const readBlobBytes = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () =>resolve(new Uint8Array(reader.result));
  reader.onerror = () =>reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

test('shows the exact bank name in the verified receipt header', async () => {
  axios.get.mockResolvedValue({ data: tenantPaymentContext });
  renderTenantPayment();

  expect(await screen.findByRole('img', { name: 'Commercial Bank of Ethiopia logo' }))
    .toHaveAttribute('src', '/images/commercial-bank-of-ethiopia.jpg');
  expect(screen.getByRole('img', { name: 'Commercial Bank of Ethiopia logo' }))
    .toHaveAttribute('width', '340');
  expect(screen.getByRole('img', { name: 'Commercial Bank of Ethiopia logo' }))
    .toHaveAttribute('height', '120');
  expect(screen.queryByText('Commercial Bank of Ethiopia')).not.toBeInTheDocument();
  expect(screen.queryByText('House Rental Management System')).not.toBeInTheDocument();
});

test('prints the selected verified receipt', async () => {
  axios.get.mockResolvedValue({ data: tenantPaymentContext });
  Object.defineProperty(window, 'print', {
    configurable: true,
    value: jest.fn(),
  });
  renderTenantPayment();
  fireEvent.click(await screen.findByRole('button', { name: 'Print Receipt' }));
  const receipt = screen.getByLabelText('Verified rent receipt for October 2026');
  expect(receipt).toHaveAttribute('data-printing', 'true');
  expect(receipt.querySelector('img')).toHaveAttribute(
    'src',
    '/images/commercial-bank-of-ethiopia.jpg'
  );

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

test('tenant receives a clear message when landlord has not registered a bank account', async () => {
  axios.get.mockResolvedValue({
    data: {
      ...tenantPaymentContext,
      landlordBankInformationComplete: false,
      landlordBankInformationMessage: 'The landlord has not registered a complete bank account.',
    },
  });
  renderTenantPayment();

  expect(await screen.findByText(/has not registered a complete bank account/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pay Rent' })).toBeDisabled();
});

test('downloads a PDF from the verified receipt', async () => {
  axios.get.mockResolvedValue({ data: tenantPaymentContext });
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
  });
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const createObjectUrl = jest.fn(() => 'blob:rent-receipt');
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  renderTenantPayment();
  fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/images/commercial-bank-of-ethiopia.jpg'));
  await waitFor(() => expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf' })));
  const downloadedPdf = createObjectUrl.mock.calls[0][0];
  const downloadedPdfBytes = await readBlobBytes(downloadedPdf);
  const logoStart = downloadedPdfBytes.findIndex((byte, index) => (
    byte === 0xff &&
    downloadedPdfBytes[index + 1] === 0xd8 &&
    downloadedPdfBytes[index + 2] === 0xff &&
    downloadedPdfBytes[index + 3] === 0xd9
  ));
  expect(logoStart).toBeGreaterThanOrEqual(0);
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
  if (originalFetch) global.fetch = originalFetch;
  else delete global.fetch;
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

test('shows landlord payment and verification details without exposing payout statuses', async () => {
  axios.get.mockResolvedValue({
    data: [{
      ...verifiedPayment,
      tenant: { name: 'Tenant Example' },
      property: { title: 'Rental Home' },
      provider: 'chapa',
      chapaTransactionReference: 'CHAPA-transaction-1',
      payoutStatus: 'PROCESSING',
      payout: { status: 'PROCESSING' },
      landlordCreditStatus: 'CREDITED',
      landlordCredit: { status: 'CREDITED', providerTransactionReference: 'CHAPA-transaction-1' },
      externalTransferStatus: 'PENDING',
    }],
  });
  render(
    <MemoryRouter>
      <LandlordPayments />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText('CHAPA-transaction-1')).toBeInTheDocument());
  expect(screen.getByText('Paid')).toBeInTheDocument();
  expect(screen.getByText('CREDITED')).toBeInTheDocument();
  expect(screen.queryByText('PENDING')).not.toBeInTheDocument();
  expect(screen.queryByText('PROCESSING')).not.toBeInTheDocument();
  expect(screen.getByText(/^Yes ·/)).toBeInTheDocument();
});
