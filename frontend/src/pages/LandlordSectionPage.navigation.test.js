import React from 'react';
import axios from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import LandlordSectionPage from './LandlordSectionPage';
import BackToPreviousPage from '../components/BackToPreviousPage';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'landlord-1' } }),
}));
jest.mock('../components/PropertyOwnershipProof', () => () => null);
jest.mock('../components/PropertyImage', () => ({ alt }) => (
  require('react').createElement('img', { alt })
));

const property = {
  _id: 'property-1',
  landlord: { _id: 'landlord-1' },
  title: 'Rented test home',
  location: 'Addis Ababa',
  price: 5000,
  availabilityStatus: 'rented',
  rentedBy: { name: 'Tenant Example' },
};
let activeProperty = property;

const Destination = () => {
  const location = useLocation();
  return (
    <>
      <BackToPreviousPage />
      <h1 data-testid="destination">{`${location.pathname}${location.search}`}</h1>
      <output data-testid="origin">{location.state?.from}</output>
    </>
  );
};

beforeEach(() => {
  localStorage.setItem('token', 'landlord-token');
  window.history.replaceState({ idx: 1 }, '');
  activeProperty = property;
  axios.get.mockReset().mockImplementation((url) => Promise.resolve({
    data: url.includes('/api/reviews/landlord') ? [] : [activeProperty],
  }));
});

test.each([
  ['Update', '/landlord/edit-property/property-1'],
  ['Message', '/landlord/messages?propertyId=property-1'],
  ['Rent Payments', '/landlord/rent-payments?propertyId=property-1'],
])(
  '%s opens its destination with rented-properties origin and can return',
  async (action, expectedDestination) => {
    render(
      <MemoryRouter initialEntries={['/landlord/rented-properties']}>
        <Routes>
          <Route
            path="/landlord/rented-properties"
            element={<LandlordSectionPage type="rented" />}
          />
          <Route
            path="/landlord/edit-property/:propertyId"
            element={<Destination />}
          />
          <Route path="/landlord/messages" element={<Destination />} />
          <Route path="/landlord/rent-payments" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: action }));
    expect(await screen.findByTestId('destination')).toHaveTextContent(expectedDestination);
    expect(screen.getByTestId('origin')).toHaveTextContent('/landlord/rented-properties');

    fireEvent.click(screen.getByRole('link', { name: '← Back to Previous Page' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Rented Properties' }))
        .toBeInTheDocument();
    });
  }
);

test('uses screenshot-matched update and delete action styles', async () => {
  activeProperty = {
    ...property,
    availabilityStatus: 'available',
    verificationStatus: 'approved',
    isVerified: true,
  };

  render(
    <MemoryRouter initialEntries={['/landlord/verified-properties']}>
      <Routes>
        <Route
          path="/landlord/verified-properties"
          element={<LandlordSectionPage type="verified" />}
        />
      </Routes>
    </MemoryRouter>
  );

  const updateButton = await screen.findByRole('button', { name: 'Update' });
  const deleteButton = screen.getByRole('button', { name: 'Delete' });
  expect(updateButton).toHaveClass('bg-[#805ad5]', 'text-white', 'h-8');
  expect(deleteButton).toHaveClass('bg-[#e53e3e]', 'text-white', 'h-8');
  expect(screen.getByRole('heading', { name: 'Verified Properties' }))
    .toHaveClass('text-2xl', 'font-bold', 'text-slate-800');
  expect(document.querySelector('.landlord-section-page-header')).not.toBeInTheDocument();
});

test('uses screenshot-matched message and rent payment action styles', async () => {
  render(
    <MemoryRouter initialEntries={['/landlord/rented-properties']}>
      <Routes>
        <Route
          path="/landlord/rented-properties"
          element={<LandlordSectionPage type="rented" />}
        />
      </Routes>
    </MemoryRouter>
  );

  const messageButton = await screen.findByRole('button', { name: 'Message' });
  const paymentButton = screen.getByRole('button', { name: 'Rent Payments' });
  expect(messageButton).toHaveClass('bg-[#4299e1]', 'text-white', 'h-8');
  expect(screen.getByRole('button', { name: 'Update' }))
    .toHaveClass('bg-[#805ad5]', 'text-white', 'h-8');
  expect(screen.getByRole('button', { name: 'Delete' }))
    .toHaveClass('bg-[#e53e3e]', 'text-white', 'h-8');
  expect(paymentButton).toHaveClass('bg-[#d69e2e]', 'text-white', 'h-8', 'col-span-3');
  expect(paymentButton.parentElement).toHaveClass('grid-cols-3');
});

test.each([
  {
    type: 'rejected',
    route: '/landlord/rejected',
    title: 'Rejected Properties',
    status: 'rejected',
    isVerified: false,
  },
  {
    type: 'verified',
    route: '/landlord/verified-properties',
    title: 'Verified Properties',
    status: 'approved',
    isVerified: true,
  },
  {
    type: 'underReview',
    route: '/landlord/under-review',
    title: 'Properties Under Review',
    status: 'pending',
    isVerified: false,
  },
])(
  '$title → Update → Back returns to the same properties section',
  async ({ type, route, title, status, isVerified }) => {
    activeProperty = {
      ...property,
      availabilityStatus: 'available',
      verificationStatus: status,
      isVerified,
    };
    const editRoute = '/landlord/edit-property/property-1';

    render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path={route}
            element={<LandlordSectionPage type={type} />}
          />
          <Route path="/landlord/edit-property/:propertyId" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Update' }));
    expect(await screen.findByTestId('destination')).toHaveTextContent(editRoute);
    expect(screen.getByTestId('origin')).toHaveTextContent(route);
    expect(screen.getByRole('link', { name: '← Back to Previous Page' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '← Back to Previous Page' }));
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  }
);
