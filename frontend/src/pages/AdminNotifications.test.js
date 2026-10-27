import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import axios from 'axios';
import AdminNotifications from './AdminNotifications';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));
jest.mock('../components/BackToDashboard', () => () => null);

const createNotification = (overrides = {}) => ({
  _id: 'notification-1',
  property: { id: 'property-1', title: 'Central apartment' },
  propertyTitle: 'Central apartment',
  rentalRequest: null,
  message: 'A property is awaiting verification.',
  instructions: 'Review this property.',
  type: 'pending',
  category: 'properties',
  read: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const createPayload = (notifications = [createNotification()], overrides = {}) => ({
  success: true,
  unreadCount: notifications.filter((item) => !item.read).length,
  totals: {
    total: notifications.length,
    unread: notifications.filter((item) => !item.read).length,
    byType: {
      properties: { total: 1, unread: 1 },
      rentals: { total: 1, unread: 0 },
      messages: { total: 0, unread: 0 },
      system: { total: 1, unread: 0 },
    },
  },
  pagination: { page: 1, limit: 20, total: notifications.length, pages: 1 },
  notifications,
  ...overrides,
});

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

const setup = (user = { role: 'admin', adminType: 'platform' }, payload = createPayload()) => {
  useAuth.mockReturnValue({ user });
  useLanguage.mockReturnValue({ t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? `{${key}}`), language: 'en' });
  axios.get.mockResolvedValue({ data: payload });
  axios.put.mockResolvedValue({ data: { success: true } });
  axios.delete.mockResolvedValue({ data: { success: true } });
};

const renderPage = (initialEntries = ['/admin-dashboard/notifications']) => render(
  <MemoryRouter initialEntries={initialEntries}>
    <Routes>
      <Route path="/admin-dashboard/notifications" element={<AdminNotifications />} />
      <Route path="/admin-dashboard/pending" element={<CurrentPath />} />
      <Route path="/admin-dashboard/all-properties" element={<CurrentPath />} />
      <Route path="/admin-dashboard/rental-requests" element={<CurrentPath />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('renders compact heading, filter counts, and highlights unread items', async () => {
  setup();
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
  await screen.findByText('Central apartment');
  expect(screen.getByText('1 unread')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Properties 1' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Messages 0' })).toBeInTheDocument();
  expect(screen.getByText('Central apartment').closest('article')).toHaveClass('is-unread');
  expect(screen.getByText('A property is awaiting verification.')).toBeInTheDocument();
});

test('mark all as read updates the displayed unread count and broadcasts to the header badge', async () => {
  setup();
  const countEvents = [];
  window.addEventListener('notifications:unread-count', (event) => countEvents.push(event.detail.unreadCount));
  renderPage();

  await screen.findByText('Central apartment');
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
  await waitFor(() => expect(screen.getByText('0 unread')).toBeInTheDocument());
  expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/notifications/read-all'),
    {},
  );
  expect(countEvents).toContain(0);
});

test('clicking the action marks the notification read and opens the related property page', async () => {
  setup();
  renderPage();

  await screen.findByText('Central apartment');
  fireEvent.click(await screen.findByRole('link', { name: 'Review property' }));
  expect(await screen.findByTestId('current-path')).toHaveTextContent('/admin-dashboard/all-properties');
  expect(axios.put).toHaveBeenCalledWith(
    expect.stringContaining('/api/notifications/notification-1/read'),
    {},
  );
});

test('Area Admin property action opens the area-scoped review page', async () => {
  setup({ role: 'admin', adminType: 'area' });
  renderPage();

  await screen.findByText('Central apartment');
  fireEvent.click(await screen.findByRole('link', { name: 'Review property' }));
  expect(await screen.findByTestId('current-path')).toHaveTextContent('/admin-dashboard/pending');
});

test('category tab fetches only its type and page controls request server pagination', async () => {
  setup();
  renderPage();
  await screen.findByText('Central apartment');
  fireEvent.click(await screen.findByRole('tab', { name: 'Rentals 1' }));

  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.stringContaining('/api/notifications'),
    expect.objectContaining({ params: { page: 1, limit: 20, type: 'rentals' } }),
  ));
});

test('Clear read confirms before requesting deletion and reloads the list', async () => {
  setup();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  renderPage();

  await screen.findByText('Central apartment');
  fireEvent.click(screen.getByRole('button', { name: 'Clear read' }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
    expect.stringContaining('/api/notifications/read'),
  ));
  expect(window.confirm).toHaveBeenCalled();
});

test('pagination requests the next server page', async () => {
  setup({ role: 'admin', adminType: 'platform' }, createPayload([createNotification()], {
    pagination: { page: 1, limit: 20, total: 25, pages: 2 },
  }));
  renderPage();
  await screen.findByText('Central apartment');

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
    expect.stringContaining('/api/notifications'),
    expect.objectContaining({ params: { page: 2, limit: 20 } }),
  ));
});

test('an empty unread filter shows the friendly caught-up state', async () => {
  setup({ role: 'admin', adminType: 'platform' }, createPayload([], {
    totals: {
      total: 0,
      unread: 0,
      byType: {
        properties: { total: 0, unread: 0 },
        rentals: { total: 0, unread: 0 },
        messages: { total: 0, unread: 0 },
        system: { total: 0, unread: 0 },
      },
    },
  }));
  renderPage();
  fireEvent.click(await screen.findByRole('tab', { name: 'Unread 0' }));

  expect(await screen.findByRole('heading', { name: 'You’re all caught up' })).toBeInTheDocument();
});
