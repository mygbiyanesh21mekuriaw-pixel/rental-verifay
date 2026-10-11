import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import BackToPreviousPage from './BackToPreviousPage';

const Destination = () => (
  <>
    <BackToPreviousPage />
    <h1>Destination page</h1>
  </>
);

beforeEach(() => {
  window.history.replaceState({ idx: 1 }, '');
});

test('returns to the actual previous in-app page when origin state is present', () => {
  render(
    <MemoryRouter
      initialEntries={[
        '/landlord/rented-properties',
        {
          pathname: '/landlord/messages',
          search: '?propertyId=property-1',
          state: { from: '/landlord/rented-properties' },
        },
      ]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/landlord/rented-properties" element={<h1>Rented Properties page</h1>} />
        <Route path="/landlord/messages" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('link', { name: '← Back to Previous Page' }));

  expect(screen.getByRole('heading', { name: 'Rented Properties page' }))
    .toBeInTheDocument();
});

test('falls back to My Properties when the destination is opened directly', () => {
  const DestinationWithPath = () => {
    const location = useLocation();
    return (
      <>
        <BackToPreviousPage />
        <h1>{location.pathname}</h1>
      </>
    );
  };

  render(
    <MemoryRouter initialEntries={['/landlord/edit-property/property-1']}>
      <Routes>
        <Route path="/landlord/my-properties" element={<h1>My Properties page</h1>} />
        <Route path="/landlord/edit-property/:propertyId" element={<DestinationWithPath />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('link', { name: '← Back to Previous Page' }));

  expect(screen.getByRole('heading', { name: 'My Properties page' }))
    .toBeInTheDocument();
});

test('falls back safely when navigation state points outside landlord property routes', () => {
  render(
    <MemoryRouter
      initialEntries={[{
        pathname: '/landlord/edit-property/property-1',
        state: { from: '/admin-dashboard' },
      }]}
    >
      <Routes>
        <Route path="/landlord/my-properties" element={<h1>My Properties page</h1>} />
        <Route path="/landlord/edit-property/:propertyId" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('link', { name: '← Back to Previous Page' }));
  expect(screen.getByRole('heading', { name: 'My Properties page' }))
    .toBeInTheDocument();
});
