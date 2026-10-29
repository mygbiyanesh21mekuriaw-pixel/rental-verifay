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
jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match),
    formatDate: (date) => new Date(date).toISOString().slice(0, 10),
  }),
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
  localStorage.removeItem('landlord-verified-properties-view');
  localStorage.removeItem('landlord-under-review-properties-view');
  localStorage.removeItem('landlord-rejected-properties-view');
  localStorage.removeItem('landlord-rented-properties-view');
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

    if (action === 'Update') {
      fireEvent.click(await screen.findByRole('button', { name: 'More actions Rented test home' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Update' }));
    } else {
      fireEvent.click(await screen.findByRole('button', { name: action }));
    }
    expect(await screen.findByTestId('destination')).toHaveTextContent(expectedDestination);
    expect(screen.getByTestId('origin')).toHaveTextContent('/landlord/rented-properties');

    fireEvent.click(screen.getByRole('link', { name: '← Back to Previous Page' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Rented Properties/ }))
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
  expect(screen.queryByRole('link', { name: 'Add House' })).not.toBeInTheDocument();
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

test('My Properties empty state offers the Add your first house action', async () => {
  axios.get.mockResolvedValue({ data: [] });
  render(
    <MemoryRouter initialEntries={['/landlord/my-properties']}>
      <LandlordSectionPage type="myProperties" />
    </MemoryRouter>
  );

  expect(await screen.findByText('You have not created any properties yet.')).toBeInTheDocument();
  const addHouseLink = screen.getByRole('link', { name: 'Add your first house' });
  expect(addHouseLink).toHaveAttribute('href', '/landlord/add-property');
});

test('verified properties keep proof off the card and expose delete in an action menu', async () => {
  activeProperty = {
    ...property,
    availabilityStatus: 'available',
    verificationStatus: 'approved',
    isVerified: true,
    hasVerificationDocument: true,
    city: 'Addis Ababa',
    subCity: 'Bole',
    bedrooms: 2,
    createdAt: '2026-03-01T10:00:00.000Z',
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
  expect(updateButton).toHaveClass('landlord-verified-update');
  expect(screen.getByText('ETB 5,000')).toBeInTheDocument();
  expect(screen.getByText('/ month')).toBeInTheDocument();
  expect(screen.getByText('Bedrooms: 2')).toBeInTheDocument();
  expect(screen.queryByText('Proof of ownership')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading proof of ownership...')).not.toBeInTheDocument();

  const menuTrigger = screen.getByRole('button', { name: 'More actions Rented test home' });
  fireEvent.click(menuTrigger);
  expect(menuTrigger).toHaveAttribute('aria-expanded', 'true');

  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  axios.delete.mockResolvedValue({});
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
    expect.stringContaining('/api/properties/property-1'),
    expect.any(Object),
  ));
  expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this property?');
  expect(alertSpy).toHaveBeenCalledWith('Property deleted successfully.');
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

test('verified properties search, sort, remember the selected view, and paginate twelve items', async () => {
  const verifiedProperties = Array.from({ length: 13 }, (_, index) => ({
    ...property,
    _id: `verified-${index}`,
    title: `Verified home ${index}`,
    location: index === 12 ? 'Unique address' : 'Addis Ababa',
    city: 'Addis Ababa',
    subCity: 'Bole',
    price: 5000 + index,
    availabilityStatus: 'available',
    verificationStatus: 'approved',
    isVerified: true,
    createdAt: `2026-03-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
  }));
  axios.get.mockResolvedValue({ data: verifiedProperties });

  const renderVerifiedPage = () => render(
    <MemoryRouter initialEntries={['/landlord/verified-properties']}>
      <Routes>
        <Route
          path="/landlord/verified-properties"
          element={<LandlordSectionPage type="verified" />}
        />
      </Routes>
    </MemoryRouter>
  );
  const renderedPage = renderVerifiedPage();

  expect(await screen.findAllByRole('article')).toHaveLength(12);
  expect(screen.getByRole('heading', { name: /Verified Properties 13/ })).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search title or address' }), {
    target: { value: 'Unique address' },
  });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Verified home 12')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search title or address' }), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
    target: { value: 'price-asc' },
  });
  const cards = screen.getAllByRole('article');
  expect(cards[0]).toHaveTextContent('Verified home 0');

  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(localStorage.getItem('landlord-verified-properties-view')).toBe('list');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(2);
  renderedPage.unmount();
  renderVerifiedPage();
  expect(await screen.findByRole('table')).toBeInTheDocument();
});

test('under-review properties show the review layout and preserve delete confirmation', async () => {
  activeProperty = {
    ...property,
    title: 'Review test home',
    location: 'Addis Ababa',
    city: 'Addis Ababa',
    subCity: 'Bole',
    area: 'Bole area',
    bedrooms: 3,
    createdAt: '2026-03-01T10:00:00.000Z',
    hasVerificationDocument: true,
    availabilityStatus: 'available',
    verificationStatus: 'pending',
    isVerified: false,
  };
  axios.delete.mockResolvedValue({});
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

  render(
    <MemoryRouter initialEntries={['/landlord/under-review']}>
      <Routes>
        <Route
          path="/landlord/under-review"
          element={<LandlordSectionPage type="underReview" />}
        />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole('heading', { name: /Properties Under Review 1/ })).toBeInTheDocument();
  expect(screen.getByText('Under review')).toHaveClass('landlord-under-review-badge');
  expect(screen.getByText('Submitted 2026-03-01')).toBeInTheDocument();
  expect(screen.getByText('Waiting for review · Bole area')).toBeInTheDocument();
  expect(screen.getByText('Bedrooms: 3')).toBeInTheDocument();
  expect(screen.getByText('/ month')).toBeInTheDocument();
  expect(screen.queryByText('Proof of ownership')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading proof of ownership...')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  expect(screen.getByRole('table', { name: 'Properties Under Review' })).toBeInTheDocument();
  expect(localStorage.getItem('landlord-under-review-properties-view')).toBe('list');
  fireEvent.click(screen.getByRole('button', { name: 'More actions Review test home' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
    expect.stringContaining('/api/properties/property-1'),
    expect.any(Object),
  ));
  expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this property?');
  expect(alertSpy).toHaveBeenCalledWith('Property deleted successfully.');
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

test('under-review empty state links to Add House', async () => {
  axios.get.mockResolvedValue({ data: [] });

  render(
    <MemoryRouter initialEntries={['/landlord/under-review']}>
      <Routes>
        <Route
          path="/landlord/under-review"
          element={<LandlordSectionPage type="underReview" />}
        />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText('No properties under review')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add House' })).toHaveAttribute('href', '/landlord/add-property');
});

test('rejected properties show available reason and rejection date without proof on the card', async () => {
  activeProperty = {
    ...property,
    title: 'Rejected test home',
    location: 'N/A',
    city: '',
    subCity: 'null',
    bedrooms: 2,
    price: 7200,
    availabilityStatus: 'available',
    verificationStatus: 'rejected',
    isVerified: false,
    rejectedAt: '2026-04-04T10:00:00.000Z',
    rejectedByName: 'Area Admin',
    history: [{ action: 'rejected', at: '2026-04-04T10:00:00.000Z', note: 'Please upload a valid ownership document for review.' }],
    hasVerificationDocument: true,
  };
  axios.delete.mockResolvedValue({});
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

  render(
    <MemoryRouter initialEntries={['/landlord/rejected']}>
      <Routes>
        <Route
          path="/landlord/rejected"
          element={<LandlordSectionPage type="rejected" />}
        />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole('heading', { name: /Rejected Properties 1/ })).toBeInTheDocument();
  expect(screen.getByText('Rejected')).toHaveClass('landlord-rejected-badge');
  expect(screen.getByText('ETB 7,200')).toBeInTheDocument();
  expect(screen.getByText('/ month')).toBeInTheDocument();
  expect(screen.getByText('Rejected 2026-04-04')).toBeInTheDocument();
  expect(screen.getByText('Rejected by Area Admin')).toBeInTheDocument();
  expect(screen.getByText('Reason for rejection')).toBeInTheDocument();
  expect(screen.getByText('Please upload a valid ownership document for review.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Read more' })).toHaveAttribute('href', '/property/property-1');
  expect(screen.queryByText('Proof of ownership')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading proof of ownership...')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  expect(screen.getByRole('table', { name: 'Rejected Properties' })).toBeInTheDocument();
  expect(screen.getByText('Rejection reason')).toBeInTheDocument();
  expect(localStorage.getItem('landlord-rejected-properties-view')).toBe('list');

  fireEvent.click(screen.getByRole('button', { name: 'More actions Rejected test home' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(
    expect.stringContaining('/api/properties/property-1'),
    expect.any(Object),
  ));
  expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this property?');
  expect(alertSpy).toHaveBeenCalledWith('Property deleted successfully.');
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

test('rejected properties empty state reports no rejected properties', async () => {
  axios.get.mockResolvedValue({ data: [] });
  render(
    <MemoryRouter initialEntries={['/landlord/rejected']}>
      <Routes>
        <Route
          path="/landlord/rejected"
          element={<LandlordSectionPage type="rejected" />}
        />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText('No rejected properties')).toBeInTheDocument();
});

test('rejected properties search, sort, toggle, and paginate twelve items', async () => {
  const rejectedProperties = Array.from({ length: 13 }, (_, index) => ({
    ...property,
    _id: `rejected-${index}`,
    title: `Rejected home ${index}`,
    location: index === 12 ? 'Unique street' : 'Addis Ababa',
    city: 'Addis Ababa',
    subCity: 'Bole',
    price: 5000 + index,
    availabilityStatus: 'available',
    verificationStatus: 'rejected',
    isVerified: false,
    createdAt: `2026-03-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
  }));
  axios.get.mockResolvedValue({ data: rejectedProperties });
  const renderRejectedPage = () => render(
    <MemoryRouter initialEntries={['/landlord/rejected']}>
      <Routes>
        <Route path="/landlord/rejected" element={<LandlordSectionPage type="rejected" />} />
      </Routes>
    </MemoryRouter>
  );
  const renderedPage = renderRejectedPage();

  expect(await screen.findAllByRole('article')).toHaveLength(12);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search title or address' }), {
    target: { value: 'Unique street' },
  });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Rejected home 12')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search title or address' }), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
    target: { value: 'price-asc' },
  });
  expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('Rejected home 0');
  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  renderedPage.unmount();
  renderRejectedPage();
  expect(await screen.findByRole('table', { name: 'Rejected Properties' })).toBeInTheDocument();
  expect(localStorage.getItem('landlord-rejected-properties-view')).toBe('list');
});

test('rented properties show renter details, keep proof off-card, and expose update/delete in the menu', async () => {
  activeProperty = {
    ...property,
    hasVerificationDocument: true,
    bedrooms: 2,
    subCity: 'Bole',
    city: 'Addis Ababa',
    rentedAt: '2026-03-01T10:00:00.000Z',
    paymentStatus: 'overdue',
  };
  axios.delete.mockResolvedValue({});
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

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
  expect(screen.getByText('Tenant Example')).toBeInTheDocument();
  expect(screen.getByText('Rented since 2026-03-01')).toBeInTheDocument();
  expect(screen.getByText('Overdue')).toHaveClass('landlord-rented-payment-overdue');
  expect(screen.getByText('Bole, Addis Ababa')).toBeInTheDocument();
  expect(screen.getByText('/ month')).toBeInTheDocument();
  expect(screen.getByText('Bedrooms: 2')).toBeInTheDocument();
  expect(screen.getByText('Rented')).toHaveClass('landlord-verified-badge');
  expect(screen.queryByText('Proof of ownership')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading proof of ownership...')).not.toBeInTheDocument();
  expect(messageButton).toHaveClass('landlord-rented-action-message');
  expect(paymentButton).toHaveClass('landlord-rented-action-payments');
  expect(screen.getByTestId('landlord-rented-grid')).toHaveClass('landlord-rented-grid');

  fireEvent.click(screen.getByRole('button', { name: 'More actions Rented test home' }));
  expect(screen.getByRole('menuitem', { name: 'Update' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await waitFor(() => {
    expect(axios.delete).toHaveBeenCalledWith(
      expect.stringContaining('/api/properties/property-1'),
      expect.any(Object),
    );
  });
  expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this property?');
  expect(alertSpy).toHaveBeenCalledWith('Property deleted successfully.');
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

test('rented properties search by tenant, sort by price, remember list view, and paginate twelve items', async () => {
  const rentedProperties = Array.from({ length: 13 }, (_, index) => ({
    ...property,
    _id: `rented-${index}`,
    title: `Rented home ${index}`,
    rentedBy: { name: `Tenant ${index}` },
    price: 5000 + index,
    rentedAt: `2026-03-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
  }));
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.includes('/api/reviews/landlord') ? [] : rentedProperties,
  }));

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

  expect(await screen.findByRole('heading', { name: /Rented Properties 13/ })).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(12);
  expect(screen.getByTestId('landlord-rented-grid')).toHaveClass('landlord-rented-grid');
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
    target: { value: 'price-asc' },
  });
  expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('Rented home 0');

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(1);

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search title, address, or tenant' }), {
    target: { value: 'Tenant 12' },
  });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Rented home 12' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  expect(await screen.findByRole('table', { name: 'Rented Properties' })).toBeInTheDocument();
  expect(screen.getByText('Tenant 12')).toBeInTheDocument();
  expect(localStorage.getItem('landlord-rented-properties-view')).toBe('list');
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
    expect(await screen.findByRole('heading', { name: new RegExp(title) })).toBeInTheDocument();
  }
);
