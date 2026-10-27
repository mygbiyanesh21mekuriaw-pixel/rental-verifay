import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminPaymentPeriods from './AdminPaymentPeriods';

const mockTranslate = (text) => text;
const mockFormatDate = (date) => new Date(date).toLocaleDateString('en-US');

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    t: mockTranslate,
    formatDate: mockFormatDate,
  }),
}));

const response = {
  payments: [{
    _id: 'payment-1',
    tenant: { name: 'Taylor Tenant' },
    property: { title: 'Sunny Apartment', area: 'nORTH dISTRICT' },
    paymentPeriod: '2026-03',
    amount: 12500,
    status: 'paid',
    paymentReference: 'reference-123456789',
    paidOn: '2026-02-20T12:00:00.000Z',
  }],
  totals: {
    totalCollected: 12500,
    totalPayments: 21,
    paidCount: 15,
    pendingFailedCount: 4,
  },
  pagination: { page: 1, limit: 10, total: 21, pages: 3 },
};

beforeEach(() => {
  localStorage.setItem('token', 'platform-token');
  axios.get.mockReset().mockResolvedValue({ data: response });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue() },
  });
});

test('shows filter-aware payment summary, table values, status, advance label, and copies references', async () => {
  render(<AdminPaymentPeriods />);

  expect((await screen.findAllByText('Taylor Tenant')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('ETB 12,500.00').length).toBe(3);
  expect(screen.getByText('Total collected')).toBeInTheDocument();
  expect(screen.getByText('15', { selector: '.admin-payment-summary-value' })).toBeInTheDocument();
  expect(screen.getAllByText('North District').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Advance').length).toBe(2);
  expect(screen.getAllByText('Paid', { selector: '.admin-payment-status-badge' })[0]).toHaveClass('is-paid');
  expect(screen.getByText('Showing 1–10 of 21')).toBeInTheDocument();

  const copyButton = screen.getByRole('button', { name: 'Copy reference reference-123456789' });
  fireEvent.click(copyButton);
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('reference-123456789'));
  expect(await screen.findByText('Reference copied.')).toBeInTheDocument();
});

test('sends filters and pagination to the server and supports page-size selection', async () => {
  render(<AdminPaymentPeriods />);
  await screen.findAllByText('Taylor Tenant');

  fireEvent.change(screen.getByPlaceholderText('Tenant, property, or reference'), {
    target: { value: 'Taylor' },
  });
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      params: expect.objectContaining({ q: 'Taylor', page: 1, limit: 10 }),
    }),
  ));

  fireEvent.change(screen.getByLabelText('Period'), { target: { value: '2026-03' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paid' } });
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      params: expect.objectContaining({ q: 'Taylor', period: '2026-03', status: 'paid' }),
    }),
  ));

  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      params: expect.objectContaining({ page: 1, limit: 25 }),
    }),
  ));
});

test('supports server paging and clear filters', async () => {
  render(<AdminPaymentPeriods />);
  await screen.findAllByText('Taylor Tenant');

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ params: expect.objectContaining({ page: 2 }) }),
  ));

  fireEvent.change(screen.getByPlaceholderText('Tenant, property, or reference'), {
    target: { value: 'Taylor' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      params: expect.objectContaining({
        q: '',
        period: '',
        area: '',
        status: '',
        from: '',
        to: '',
        page: 1,
        sort: 'date:desc',
      }),
    }),
  ));
});

test('renders compact payment information in the mobile card layout', async () => {
  render(<AdminPaymentPeriods />);
  const mobileList = await screen.findAllByText('Taylor Tenant')
    .then(() => document.querySelector('.admin-payment-mobile-list'));
  expect(mobileList).toBeInTheDocument();
  const mobileCard = within(mobileList).getByText('Sunny Apartment').closest('article');
  expect(within(mobileCard).getByText('ETB 12,500.00')).toBeInTheDocument();
  expect(within(mobileCard).getByText('March 2026')).toBeInTheDocument();
});
