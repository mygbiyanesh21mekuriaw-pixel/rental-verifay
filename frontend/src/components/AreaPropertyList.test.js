import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AreaPropertyList from './AreaPropertyList';

jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match),
    formatDate: (date) => new Date(date).toISOString().slice(0, 10),
  }),
}));

const properties = [
  {
    _id: 'property-a',
    title: 'Central apartment',
    price: 20000,
    city: 'Addis Ababa',
    subCity: 'Bole',
    area: 'Addis Ababa',
    bedrooms: 2,
    landlord: { name: 'Abel Landlord' },
    createdAt: '2026-03-01T10:00:00.000Z',
    verificationStatus: 'approved',
    isVerified: true,
    decision: 'verified',
    handledByName: 'Area Admin',
    handledAt: '2026-03-02T10:00:00.000Z',
  },
  {
    _id: 'property-b',
    title: 'Quiet house',
    price: 10000,
    city: 'Addis Ababa',
    subCity: 'Yeka',
    area: 'Addis Ababa',
    bedrooms: 3,
    landlord: { name: 'Zara Owner' },
    createdAt: '2026-02-01T10:00:00.000Z',
    verificationStatus: 'pending',
    isVerified: false,
  },
];

const renderList = (props = {}) => render(
  <AreaPropertyList properties={properties} {...props} />,
);

beforeEach(() => {
  localStorage.removeItem('admin-properties-view');
});

test('renders status badges, compact property cards and handler summary without content tabs', () => {
  renderList();

  expect(screen.queryByRole('navigation', { name: 'Property status filters' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Central apartment' })).toBeInTheDocument();
  expect(screen.getByText('Verified by Area Admin · 2026-03-02')).toBeInTheDocument();
  expect(screen.getAllByText('Under Review').find((element) => (
    element.classList.contains('admin-property-status-badge')
  ))).toHaveClass('is-under-review');
  expect(screen.queryByText('Proof of Ownership')).not.toBeInTheDocument();
  expect(screen.queryByText(/Handled before history tracking/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Status:/)).not.toBeInTheDocument();
});

test('searches by landlord or address and sorts by price', () => {
  renderList();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search properties' }), {
    target: { value: 'zara' },
  });
  expect(screen.getByRole('heading', { name: 'Quiet house' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Central apartment' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search properties' }), {
    target: { value: 'Addis Ababa' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
    target: { value: 'price-asc' },
  });
  const titles = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
  expect(titles).toEqual(['Quiet house', 'Central apartment']);
});

test('switches to a table list and remembers the selected view', () => {
  const rendered = renderList();
  const viewGroup = screen.getByRole('group', { name: 'Property view' });
  fireEvent.click(within(viewGroup).getByRole('button', { name: 'List' }));

  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(localStorage.getItem('admin-properties-view')).toBe('list');
  rendered.unmount();

  renderList();
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Property view' })).getByRole('button', { name: 'List' }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('shows verification actions only when enabled and calls the existing handler', () => {
  const onAction = jest.fn();
  renderList({
    properties: [properties[1]],
    canManageVerification: true,
    onAction,
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
  expect(onAction).toHaveBeenCalledWith('property-b', 'verify');
});

test('requires a trimmed rejection reason and submits it through the existing action handler', async () => {
  const onAction = jest.fn().mockResolvedValue({ success: true });
  renderList({ properties: [properties[1]], canManageVerification: true, onAction });

  const rejectButton = screen.getByRole('button', { name: 'Reject' });
  fireEvent.click(rejectButton);
  const dialog = screen.getByRole('dialog', { name: 'Reject property' });
  const submitButton = within(dialog).getByRole('button', { name: 'Reject' });
  const textarea = within(dialog).getByRole('textbox', { name: 'Reason for rejection (required)' });

  expect(submitButton).toBeDisabled();
  fireEvent.change(textarea, { target: { value: 'too short' } });
  expect(submitButton).toBeDisabled();
  fireEvent.change(textarea, { target: { value: 'x'.repeat(501) } });
  expect(submitButton).toBeDisabled();
  fireEvent.change(textarea, { target: { value: '  Needs a clearer address  ' } });
  expect(submitButton).toBeEnabled();
  await act(async () => {
    fireEvent.click(submitButton);
  });

  await waitFor(() => {
    expect(onAction).toHaveBeenCalledWith('property-b', 'reject', 'Needs a clearer address');
  });
  expect(await screen.findByRole('status')).toHaveTextContent('Property rejected successfully.');
  expect(rejectButton).toHaveFocus();
});

test('shows the server rejection error and quick-pick text remains editable', async () => {
  const onAction = jest.fn().mockResolvedValue({ success: false, message: 'Server rejected the request.' });
  renderList({ properties: [properties[1]], canManageVerification: true, onAction });

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  const dialog = screen.getByRole('dialog', { name: 'Reject property' });
  const textarea = within(dialog).getByRole('textbox', { name: 'Reason for rejection (required)' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Incorrect address' }));
  expect(textarea).toHaveValue('Incorrect address');
  fireEvent.change(textarea, { target: { value: 'Incorrect address - the kebele is missing.' } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
  });

  expect(await screen.findByRole('alert')).toHaveTextContent('Server rejected the request.');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Reject property' })).not.toBeInTheDocument();
});

test('paginates local results by twelve', () => {
  const manyProperties = Array.from({ length: 13 }, (_, index) => ({
    ...properties[0],
    _id: `property-${index}`,
    title: `Property ${index}`,
  }));
  renderList({ properties: manyProperties });

  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
});
