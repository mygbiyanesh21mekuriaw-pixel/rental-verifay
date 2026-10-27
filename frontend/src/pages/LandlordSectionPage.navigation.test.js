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
jest.mock('../components/PropertyOwnershipProof', () => ({ hasProof, className }) => (
  hasProof
    ? require('react').createElement(
      'div',
      { className },
      require('react').createElement(
        'span',
        { className: 'property-ownership-proof-loading', role: 'status' },
        'Loading proof of ownership...',
      ),
    )
    : null
));
jest.mock('../components/PropertyImage', () => ({
  alt,
  src,
  className,
  fallbackClassName,
  fallbackText,
}) => (
  (Array.isArray(src) ? src.length > 0 : Boolean(src))
    ? require('react').createElement('img', { alt, className })
    : require('react').createElement(
      'div',
      { className: fallbackClassName, role: 'img', 'aria-label': alt || fallbackText },
      fallbackText,
    )
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

test('My Properties provides status counts, search, Add House navigation, and filtered cards', async () => {
  const properties = [
    { ...property, _id: 'verified-1', title: 'Verified Apartment', availabilityStatus: 'available', verificationStatus: 'approved', isVerified: true },
    { ...property, _id: 'pending-1', title: 'Review House', availabilityStatus: 'available', verificationStatus: 'pending', isVerified: false },
    { ...property, _id: 'rented-1', title: 'Rented House', availabilityStatus: 'rented', verificationStatus: 'approved', isVerified: true },
    { ...property, _id: 'rejected-1', title: 'Rejected House', availabilityStatus: 'available', verificationStatus: 'rejected', isVerified: false },
  ];
  axios.get.mockResolvedValue({ data: properties });

  render(
    <MemoryRouter initialEntries={['/landlord/my-properties']}>
      <Routes>
        <Route path="/landlord/my-properties" element={<LandlordSectionPage type="myProperties" />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole('heading', { name: /My Properties 4/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add House' })).toHaveAttribute('href', '/landlord/add-property');
  expect(screen.getByRole('tab', { name: 'Verified 1' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Under review 1' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Rented 1' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Rejected 1' })).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(4);
  ['Verified Apartment', 'Review House', 'Rented House', 'Rejected House'].forEach((title) => {
    expect(screen.getByRole('img', { name: title })).toHaveTextContent('No photo');
  });
  ['Verified', 'Under review', 'Rented', 'Rejected'].forEach((label) => {
    expect(screen.getAllByText(label)).toHaveLength(2);
  });

  fireEvent.click(screen.getByRole('tab', { name: 'Under review 1' }));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Review House' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'All 4' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search title or address' }), {
    target: { value: 'Rented House' },
  });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Rented House' })).toBeInTheDocument();
  expect(screen.getByText('Proof of ownership')).toBeInTheDocument();
  expect(screen.getByText('Not uploaded')).toBeInTheDocument();
});

test('My Properties preserves Update navigation and Delete confirmation behavior', async () => {
  activeProperty = {
    ...property,
    availabilityStatus: 'available',
    verificationStatus: 'approved',
    isVerified: true,
    hasVerificationDocument: true,
  };
  axios.delete.mockResolvedValue({});
  const confirmSpy = jest.spyOn(window, 'confirm');
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

  render(
    <MemoryRouter initialEntries={['/landlord/my-properties']}>
      <Routes>
        <Route path="/landlord/my-properties" element={<LandlordSectionPage type="myProperties" />} />
        <Route path="/landlord/edit-property/:propertyId" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );

  const updateButton = await screen.findByRole('button', { name: 'Update' });
  expect(screen.getByText('Loading proof of ownership...')).toBeInTheDocument();
  fireEvent.click(updateButton);
  expect(await screen.findByTestId('destination')).toHaveTextContent('/landlord/edit-property/property-1');
  fireEvent.click(screen.getByRole('link', { name: '← Back to Previous Page' }));
  expect(await screen.findByRole('heading', { name: /My Properties 1/ })).toBeInTheDocument();

  confirmSpy.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(axios.delete).not.toHaveBeenCalled();

  confirmSpy.mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
    expect.stringContaining('/api/properties/property-1'),
    expect.any(Object),
  ));
  expect(alertSpy).toHaveBeenCalledWith('Property deleted successfully.');
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

test('My Properties empty state offers Add House', async () => {
  axios.get.mockResolvedValue({ data: [] });
  render(
    <MemoryRouter initialEntries={['/landlord/my-properties']}>
      <LandlordSectionPage type="myProperties" />
    </MemoryRouter>
  );

  expect(await screen.findByText('You have not created any properties yet.')).toBeInTheDocument();
  const addHouseLinks = screen.getAllByRole('link', { name: 'Add House' });
  expect(addHouseLinks).toHaveLength(2);
  addHouseLinks.forEach((link) => {
    expect(link).toHaveAttribute('href', '/landlord/add-property');
  });
});

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
