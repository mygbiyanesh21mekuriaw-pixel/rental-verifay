import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPlaces from './AdminPlaces';
import { LanguageProvider } from '../context/LanguageContext';

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
}));

const place = {
  _id: 'place-1',
  name: 'North',
  region: 'AMHARA',
  addressMapping: { region: '', zone: 'weldeya', wereda: '', city: '' },
  activeAdminCount: 0,
  adminCount: 0,
  areaAdmin: null,
  propertyCount: 3,
  waitingPropertyCount: 2,
  historyCount: 0,
  hasNoActiveAdminWithWaitingItems: true,
  waitingItemCount: 3,
  isActive: true,
};

const responseFor = (areas = [place], unassigned = []) => ({
  areas,
  totals: {
    totalAreas: areas.length,
    areasWithAdmin: areas.filter((area) => area.activeAdminCount > 0).length,
    areasWithoutAdmin: areas.filter((area) => area.activeAdminCount === 0).length,
    unassignedProperties: unassigned.length,
  },
});

const renderPage = (initialEntries = ['/admin-dashboard/places']) => render(
  <LanguageProvider>
    <MemoryRouter initialEntries={initialEntries}>
      <AdminPlaces />
    </MemoryRouter>
  </LanguageProvider>,
);

beforeEach(() => {
  localStorage.setItem('token', 'platform-token');
  axios.get.mockReset().mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/unassigned-properties') ? [] : responseFor(),
  }));
  axios.post.mockReset().mockResolvedValue({ data: { message: 'Place added successfully.' } });
  axios.put.mockReset().mockResolvedValue({ data: { message: 'Place updated successfully.' } });
  axios.patch.mockReset().mockResolvedValue({ data: { message: 'Place disabled successfully.' } });
  axios.delete.mockReset().mockResolvedValue({ data: { message: 'Place deleted successfully.' } });
  window.confirm = jest.fn(() => true);
});

test('shows area summary, matching rules, admin shortcut and property counts in a table', async () => {
  renderPage();

  const row = await screen.findByRole('row', { name: /North/ });
  expect(within(row).getByText('Zone: weldeya')).toBeInTheDocument();
  expect(within(row).getByText('None')).toBeInTheDocument();
  expect(within(row).getByText('Assign admin')).toHaveAttribute(
    'href',
    '/admin-dashboard/admin-management?assignArea=North',
  );
  expect(within(row).getByText('3')).toBeInTheDocument();
  expect(within(row).getByText('2 waiting')).toBeInTheDocument();
  expect(screen.getByText('Total areas')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Area North has no active Area Admin; 3 items are waiting.',
  );
});

test('opens the Add Place modal and validates required address matching rules', async () => {
  renderPage();
  await screen.findByText('North');
  fireEvent.click(screen.getByRole('button', { name: '+ Add Place' }));
  fireEvent.change(screen.getByLabelText('Place name *'), { target: { value: 'Dessie' } });
  fireEvent.submit(document.getElementById('admin-place-form'));

  expect(await screen.findByRole('alert')).toHaveTextContent('At least one address matching rule is required.');
  expect(axios.post).not.toHaveBeenCalled();
});

test('editing saves address matching rules and the form server error names the conflicting area', async () => {
  renderPage();
  const row = await screen.findByRole('row', { name: /North/ });
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Place name *'), { target: { value: 'South' } });
  fireEvent.change(screen.getByLabelText('Match City'), { target: { value: 'Dessie' } });

  axios.put.mockRejectedValue({
    response: {
      status: 409,
      data: {
        message: 'Address matching rules overlap with another active area.',
        conflictingArea: 'North Wollo',
      },
    },
  });
  fireEvent.submit(document.getElementById('admin-place-form'));

  await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
    '/api/areas/place-1',
    {
      name: 'South',
      region: 'AMHARA',
      addressMapping: { region: '', zone: 'weldeya', wereda: '', city: 'Dessie' },
    },
    { headers: { Authorization: 'Bearer platform-token' } },
  ));
  expect(await screen.findByRole('alert')).toHaveTextContent('Conflicts with: North Wollo');
});

test('disables an area via its action menu', async () => {
  renderPage();
  const row = await screen.findByRole('row', { name: /North/ });
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Disable' }));

  await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(
    '/api/areas/place-1/status',
    { isActive: false },
    { headers: { Authorization: 'Bearer platform-token' } },
  ));
  expect(await screen.findByText('Place disabled successfully.')).toBeInTheDocument();
});

test('does not offer Delete while an area still has properties', async () => {
  renderPage();
  const row = await screen.findByRole('row', { name: /North/ });
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
  expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
});

test('paginates area rows at ten per page', async () => {
  const manyPlaces = Array.from({ length: 11 }, (_value, index) => ({
    ...place,
    _id: `area-${index + 1}`,
    name: `Area ${index + 1}`,
    areaAdmin: { name: `Admin ${index + 1}`, status: 'active' },
    activeAdminCount: 1,
    adminCount: 1,
    propertyCount: 0,
    waitingPropertyCount: 0,
    historyCount: 0,
    hasNoActiveAdminWithWaitingItems: false,
  }));
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/unassigned-properties') ? [] : responseFor(manyPlaces),
  }));
  renderPage();

  expect(await screen.findByText('Area 1', { exact: true })).toBeInTheDocument();
  expect(screen.queryByText('Area 11', { exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Area 11', { exact: true })).toBeInTheDocument();
  expect(screen.queryByText('Area 1', { exact: true })).not.toBeInTheDocument();
});

test('deletes only an area with no attached records after confirmation', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/unassigned-properties') ? [] : responseFor([{
      ...place,
      propertyCount: 0,
      waitingPropertyCount: 0,
      historyCount: 0,
      adminCount: 0,
      hasNoActiveAdminWithWaitingItems: false,
    }]),
  }));
  renderPage();
  const row = await screen.findByRole('row', { name: /North/ });
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/areas/place-1', {
    headers: { Authorization: 'Bearer platform-token' },
  }));
});

test('unassigned property link opens a prefilled matching-area form', async () => {
  const unassigned = [{
    _id: 'property-7',
    title: 'Unmapped home',
    location: 'Dessie',
    region: 'Amhara',
    zone: 'South Wollo',
    wereda: 'Dessie Town',
    city: 'Dessie',
  }];
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/unassigned-properties') ? unassigned : responseFor([place], unassigned),
  }));
  renderPage(['/admin-dashboard/places?unassignedProperty=property-7']);

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Region')).toHaveValue('Amhara');
  expect(screen.getByLabelText('Match Zone')).toHaveValue('South Wollo');
  expect(screen.getByLabelText('Match City')).toHaveValue('Dessie');
});
