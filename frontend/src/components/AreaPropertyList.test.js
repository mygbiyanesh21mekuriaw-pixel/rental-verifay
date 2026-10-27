import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
