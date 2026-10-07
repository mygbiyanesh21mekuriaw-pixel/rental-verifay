import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FaBars,
  FaBell,
  FaBuilding,
  FaCheck,
  FaCog,
  FaFileAlt,
  FaHardHat,
  FaHome,
  FaHourglassHalf,
  FaMoneyBill,
  FaPlus,
  FaSignOutAlt,
  FaStar,
  FaTimes,
} from 'react-icons/fa';
import LandlordSectionPage from './LandlordSectionPage';
import LandlordRequests from './LandlordRequests';
import LandlordPayments from './LandlordPayments';
import LandlordProfile from './LandlordProfile';
import LandlordNotifications from './LandlordNotifications';
import PropertyOwnershipProof from '../components/PropertyOwnershipProof';
import PropertyImage from '../components/PropertyImage';
import { getPropertyImages } from '../utils/propertyMedia';
import ProfileAvatar from '../components/ProfileAvatar';
import './landlordDashboard.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const isValidImageFile = (file) => {
  if (!file) return false;
  const lowerCaseName = file.name.toLowerCase();
  const hasAllowedExtension = /\.(jpe?g|png|webp)$/i.test(lowerCaseName);
  const hasAllowedMimeType = ALLOWED_IMAGE_TYPES.includes(file.type);
  return hasAllowedExtension && hasAllowedMimeType;
};

const getFileErrorMessage = (file, label) => {
  if (!file) return '';

  if (!isValidImageFile(file)) {
    return `${label} must be a JPG, JPEG, PNG, or WEBP image.`;
  }

  if (file.size >MAX_FILE_SIZE) {
    return 'File too large. Maximum allowed size is 10 MB per file.';
  }

  return '';
};

export const landlordSidebarItems = [
  { key: 'myProperties', label: 'My Properties', icon: <FaHome aria-hidden="true" />, path: '/landlord/my-properties' },
  { key: 'verified', label: 'Verified Properties', icon: <FaCheck aria-hidden="true" />, path: '/landlord/verified-properties' },
  { key: 'addProperty', label: 'Add Property', icon: <FaPlus aria-hidden="true" />, path: '/landlord/add-property' },
  { key: 'rentalRequests', label: 'Rental Requests', icon: <FaFileAlt aria-hidden="true" />, path: '/landlord/rental-requests' },
  { key: 'rented', label: 'Rented Properties', icon: <FaHardHat aria-hidden="true" />, path: '/landlord/rented-properties' },
  { key: 'reviews', label: 'Tenant Reviews', icon: <FaStar aria-hidden="true" />, path: '/landlord/reviews' },
  { key: 'underReview', label: 'Under Review', icon: <FaHourglassHalf aria-hidden="true" />, path: '/landlord/under-review' },
  { key: 'rejected', label: 'Rejected', icon: <FaTimes aria-hidden="true" />, path: '/landlord/rejected' },
  { key: 'rentPayments', label: 'Rent Payments', icon: <FaMoneyBill aria-hidden="true" />, path: '/landlord/rent-payments' },
  { key: 'notifications', label: 'Notifications', icon: <FaBell aria-hidden="true" />, path: '/landlord/notifications' },
  { key: 'accountSettings', label: 'Account Settings', icon: <FaCog aria-hidden="true" />, path: '/landlord/account-settings' },
  { key: 'bankInformation', label: 'Bank Information', icon: <FaBuilding aria-hidden="true" />, path: '/landlord/bank-information' },
];

export const LandlordSidebar = ({
  user,
  notificationCount = 0,
  isOpen = false,
  onNavigate,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const getActiveKey = () => {
    const exactMatch = landlordSidebarItems.find((item) => {
      if (item.path === location.pathname) return true;
      if (item.path === '/landlord/add-property') {
        return location.pathname.startsWith('/landlord/edit-property');
      }
      return false;
    });

    return exactMatch ? exactMatch.key : 'myProperties';
  };

  const activeSection = getActiveKey();

  return (
    <aside
      id="landlord-navigation"
      className={`landlord-sidebar fixed inset-y-0 left-0 z-40 flex w-[260px] translate-x-0 flex-col border-r border-slate-700 bg-slate-900 text-slate-200 shadow-lg ${isOpen ? 'is-open' : ''}`}
    >
        <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg text-white shadow-sm">
            <FaBuilding aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Workspace</p>
            <h1 className="text-xl font-bold text-white">House Rental Management System</h1>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
          {landlordSidebarItems.map(({ key, label, icon, path }) => {
            const isActive = activeSection === key;
            const isNotifications = key === 'notifications';

            return (
              <Link
                key={key}
                to={path}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-[#493ed6] text-white shadow-sm ring-1 ring-white/10'
                    : 'text-white hover:bg-[#6675e8] hover:text-white'
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-base shadow-sm ring-1 ring-slate-700">
                  {icon}
                </span>
                <span className="flex-1 truncate">{label}</span>
                {isNotifications && notificationCount > 0 && (
                  <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {notificationCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-700 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-slate-400">{user?.email || 'user@example.com'}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Landlord</p>
            </div>
          </div>
        </div>
    </aside>
  );
};

export const LandlordLayout = ({ children, user: suppliedUser = null, notificationCount = 0 }) => {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = suppliedUser || authUser;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="landlord-layout min-h-screen bg-slate-50 text-slate-900">
      <header className="landlord-mobile-header">
        <button
          type="button"
          className="landlord-menu-toggle"
          aria-label={menuOpen ? 'Close landlord navigation' : 'Open landlord navigation'}
          aria-expanded={menuOpen}
          aria-controls="landlord-navigation"
          onClick={() =>setMenuOpen((open) => !open)}
        >
          {menuOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
        </button>
        <span className="landlord-mobile-title">House Rental</span>
        <Link to="/landlord/profile" className="landlord-mobile-profile-link" aria-label="Profile">
          <ProfileAvatar user={user} className="landlord-mobile-profile-avatar" />
          <span>Profile</span>
        </Link>
        <button type="button" className="landlord-mobile-logout" onClick={handleLogout}>
          <FaSignOutAlt aria-hidden="true" />
          <span>Logout</span>
        </button>
      </header>
      <button
        type="button"
        className={`landlord-sidebar-backdrop ${menuOpen ? 'is-open' : ''}`}
        onClick={() =>setMenuOpen(false)}
        aria-label="Close landlord navigation"
        tabIndex={menuOpen ? 0 : -1}
      />
      <LandlordSidebar
        user={user}
        notificationCount={notificationCount}
        isOpen={menuOpen}
        onNavigate={() =>setMenuOpen(false)}
      />
      <main className="landlord-layout-main min-h-screen py-5 lg:py-8">
        <div>{children}</div>
      </main>
    </div>
  );
};

const LandlordDashboard = ({ initialShowForm = false }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { propertyId } = useParams();
  const [notificationCount, setNotificationCount] = useState(0);
  const isEditMode = Boolean(propertyId);
  const location = useLocation();
  const [showForm, setShowForm] = useState(initialShowForm || isEditMode);
  const [editLoading, setEditLoading] = useState(isEditMode);
  const [activeSection, setActiveSection] = useState('overview');
  const [overviewStats, setOverviewStats] = useState({
    properties: 0,
    verified: 0,
    rented: 0,
    requests: 0,
    payments: 0,
    notifications: 0,
  });
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    region: '',
    zone: '',
    wereda: '',
    city: '',
    subCity: '',
    kebele: '',
    houseNumber: '',
    bedrooms: '',
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [existingPropertyImages, setExistingPropertyImages] = useState([]);
  const [documentFile, setDocumentFile] = useState(null);
  const [existingProofOfOwnership, setExistingProofOfOwnership] = useState('');

  useEffect(() => {
    setShowForm(initialShowForm || isEditMode);
    if (initialShowForm) {
      setActiveSection('addProperty');
    }
    if (!isEditMode) return;

    const loadProperty = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/properties/${propertyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const property = response.data;
        setExistingPropertyImages(getPropertyImages(property));
        setFormData({
          title: property.title || '',
          description: property.description || '',
          price: property.price || '',
          region: property.region || '',
          zone: property.zone || '',
          wereda: property.wereda || '',
          city: property.city || '',
          subCity: property.subCity || '',
          kebele: property.kebele || '',
          houseNumber: property.houseNumber || '',
          bedrooms: property.bedrooms ?? '',
        });
        setExistingProofOfOwnership(property.verificationDocument || '');
      } catch (error) {
        setFormError(error.response?.data?.message || 'Unable to load property');
      } finally {
        setEditLoading(false);
      }
    };

    loadProperty();
  }, [initialShowForm, isEditMode, propertyId]);

  useEffect(() => {
    if (!user) {
      setNotificationCount(0);
      return;
    }

    const fetchNotificationCount = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/notifications/unread-count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setNotificationCount(Number(response.data?.unreadCount ?? response.data?.count ?? 0));
      } catch (error) {
        setNotificationCount(0);
      }
    };

    fetchNotificationCount();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setOverviewStats({
        properties: 0,
        verified: 0,
        rented: 0,
        requests: 0,
        payments: 0,
        notifications: 0,
      });
      return;
    }

    const loadOverviewStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const [propertiesRes, requestsRes, paymentsRes] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_URL}/api/properties`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${process.env.REACT_APP_API_URL}/api/rental-requests/landlord-requests`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${process.env.REACT_APP_API_URL}/api/payments/landlord`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const properties = Array.isArray(propertiesRes.data) ? propertiesRes.data : [];
        const landlordProperties = properties.filter((property) =>String(property.landlord?._id || property.landlord) === String(user.id));
        const requests = Array.isArray(requestsRes.data) ? requestsRes.data : [];
        const payments = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];

        setOverviewStats({
          properties: landlordProperties.length,
          verified: landlordProperties.filter((property) =>property.isVerified && property.verificationStatus === 'approved').length,
          rented: landlordProperties.filter((property) =>property.availabilityStatus === 'rented').length,
          requests: requests.length,
          payments: payments.length,
          notifications: notificationCount,
        });
      } catch (error) {
        setOverviewStats({
          properties: 0,
          verified: 0,
          rented: 0,
          requests: 0,
          payments: 0,
          notifications: notificationCount,
        });
      }
    };

    loadOverviewStats();
  }, [user, notificationCount]);

  const handleSidebarClick = (key) => {
    if (key === 'logout') {
      logout();
      navigate('/', { replace: true });
      return;
    }

    if (key === 'addProperty') {
      navigate('/landlord/add-property');
      setShowForm(true);
      setActiveSection('addProperty');
      return;
    }

    const pathMap = {
      myProperties: '/landlord/my-properties',
      verified: '/landlord/verified-properties',
      rentalRequests: '/landlord/rental-requests',
      rented: '/landlord/rented-properties',
      reviews: '/landlord/reviews',
      underReview: '/landlord/under-review',
      rejected: '/landlord/rejected',
      rentPayments: '/landlord/rent-payments',
      messages: '/landlord/messages',
      profile: '/landlord/profile',
      notifications: '/landlord/notifications',
    };

    if (pathMap[key]) {
      navigate(pathMap[key]);
    }

    setShowForm(false);
    setActiveSection(key);
  };

  const handleCardClick = (key) => {
    if (key === 'addProperty') {
      setShowForm(true);
      setActiveSection('addProperty');
      return;
    }

    setShowForm(false);
    setActiveSection(key);
  };

  const handleFormChange = (e) => {
    setFormData((previous) => ({
      ...previous,
      [e.target.name]: e.target.value,
    }));
  };

  const handleFileChange = (e) => {
    if (e.target.name === 'images') {
      const chosenFiles = Array.from(e.target.files || []);
      const invalidFile = chosenFiles.find((file) =>getFileErrorMessage(file, 'Property image'));

      if (chosenFiles.length > 5) {
        setFormError('You can upload up to 5 property images.');
        e.target.value = '';
        setImageFiles([]);
        return;
      }

      if (invalidFile) {
        setFormError(getFileErrorMessage(invalidFile, 'Property image'));
        e.target.value = '';
        setImageFiles([]);
        return;
      }

      setFormError('');
      setImageFiles(chosenFiles);
    } else if (e.target.name === 'document') {
      const chosenFile = e.target.files[0];
      const fileError = getFileErrorMessage(chosenFile, 'Proof of ownership');

      if (fileError) {
        setFormError(fileError);
        e.target.value = '';
        setDocumentFile(null);
        return;
      }

      setFormError('');
      setDocumentFile(chosenFile);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const imageValidationError = imageFiles.find((file) =>getFileErrorMessage(file, 'Property image'));
    if (imageValidationError) {
      setFormError(getFileErrorMessage(imageValidationError, 'Property image'));
      return;
    }

    if (documentFile) {
      const proofError = getFileErrorMessage(documentFile, 'Proof of ownership');
      if (proofError) {
        setFormError(proofError);
        return;
      }
    }

    const requiredAddressFields = [
      ['region', 'Region'],
      ['zone', 'Zone'],
      ['wereda', 'Wereda'],
      ['city', 'City'],
      ['subCity', 'Sub-city'],
      ['kebele', 'Kebele'],
      ['houseNumber', 'House Number'],
    ];
    const missingAddress = requiredAddressFields.find(([field]) => !formData[field].trim());
    if (missingAddress) {
      setFormError(`${missingAddress[1]} is required`);
      return;
    }

    if (!isEditMode && !documentFile) {
      setFormError('You must attach proof of ownership');
      return;
    }

    if (!isEditMode && imageFiles.length === 0) {
      setFormError('You must upload at least one property image');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      if (isEditMode) {
        const formDataToSend = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
          formDataToSend.append(key, value);
        });

        if (imageFiles.length > 0) {
          imageFiles.forEach((file) => {
            formDataToSend.append('images', file);
          });
        }

        if (documentFile) {
          formDataToSend.append('document', documentFile);
        }

        const response = await axios.put(`${process.env.REACT_APP_API_URL}/api/properties/${propertyId}`, formDataToSend, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
        const successMessage = response.data?.message || 'Property updated successfully.';
        navigate('/landlord/my-properties', {
          replace: true,
          state: { successMessage },
        });
      } else {
        const formDataToSend = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
          formDataToSend.append(key, value);
        });
        imageFiles.forEach((file) => {
          formDataToSend.append('images', file);
        });
        formDataToSend.append('document', documentFile);

        await axios.post(`${process.env.REACT_APP_API_URL}/api/properties`, formDataToSend, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      if (!isEditMode) {
        setFormSuccess('Property submitted successfully! Verification is pending');
      }
      setFormData({
        title: '',
        description: '',
        price: '',
        region: '',
        zone: '',
        wereda: '',
        city: '',
        subCity: '',
        kebele: '',
        houseNumber: '',
        bedrooms: '',
      });
      setImageFiles([]);
      setExistingPropertyImages([]);
      setDocumentFile(null);
      setShowForm(false);
      if (isEditMode) {
        setActiveSection('myProperties');
      } else {
        setActiveSection('underReview');
        navigate('/landlord/under-review');
      }
    } catch (error) {
      setFormError(
        error.response?.data?.error ||
          error.response?.data?.message ||
          'An error occurred'
      );
    }
  };

  const renderOverview = () => {
    const cards = [
      { key: 'myProperties', label: 'My Properties', value: overviewStats.properties, icon: <FaHome aria-hidden="true" />, path: '/landlord/my-properties', accent: 'bg-blue-50 text-blue-700' },
      { key: 'verified', label: 'Verified Properties', value: overviewStats.verified, icon: <FaCheck aria-hidden="true" />, path: '/landlord/verified-properties', accent: 'bg-[#1d4ed8] text-white' },
      { key: 'rentalRequests', label: 'Rental Requests', value: overviewStats.requests, icon: <FaFileAlt aria-hidden="true" />, path: '/landlord/rental-requests', accent: 'bg-violet-50 text-violet-700' },
      { key: 'rented', label: 'Rented Properties', value: overviewStats.rented, icon: <FaHardHat aria-hidden="true" />, path: '/landlord/rented-properties', accent: 'bg-amber-50 text-amber-700' },
      { key: 'rentPayments', label: 'Rent Payments', value: overviewStats.payments, icon: <FaMoneyBill aria-hidden="true" />, path: '/landlord/rent-payments', accent: 'bg-cyan-50 text-cyan-700' },
      { key: 'notifications', label: 'Notifications', value: overviewStats.notifications, icon: <FaBell aria-hidden="true" />, path: '/landlord/notifications', accent: 'bg-rose-50 text-rose-700' },
    ];

    return (
      <div className="space-y-6">
        <div className="landlord-dashboard-header">
          <h2 className="landlord-dashboard-title">Landlord Dashboard</h2>
          <p className="landlord-dashboard-welcome">Welcome to {user?.name || 'Landlord'}.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              className="group h-full min-h-[170px] rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              onClick={() => {
                setActiveSection(card.key);
                navigate(card.path);
              }}
            >
              <div className="flex h-full items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{card.value}</p>
                </div>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl shadow-sm ring-1 ring-slate-200 ${card.accent}`}>
                  {card.icon}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderMainSection = () => {
    switch (activeSection) {
      case 'overview':
        return renderOverview();
      case 'myProperties':
        return <LandlordSectionPage type="myProperties" />;
      case 'verified':
        return <LandlordSectionPage type="verified" />;
      case 'underReview':
        return <LandlordSectionPage type="underReview" />;
      case 'rejected':
        return <LandlordSectionPage type="rejected" />;
      case 'rented':
        return <LandlordSectionPage type="rented" />;
      case 'rentalRequests':
        return <LandlordRequests />;
      case 'rentPayments':
        return <LandlordPayments />;
      case 'notifications':
        return <LandlordNotifications />;
      case 'profile':
        return <LandlordProfile />;
      default:
        return renderOverview();
    }
  };

  useEffect(() => {
    if (!isEditMode && !initialShowForm && location.pathname === '/landlord-dashboard') {
      setActiveSection('overview');
    }
  }, [initialShowForm, isEditMode, location.pathname]);

  return (
    <>
      {!showForm && renderMainSection()}

      {showForm && (
        <div className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="landlord-property-form-header">
            <h3 className="landlord-property-form-title">
              {isEditMode ? 'Update property' : 'Add a new property'}
            </h3>
          </div>

            {formError && <div style={styles.errorMsg}>{formError}</div>}
            {formSuccess && <div style={styles.successMsg}>{formSuccess}</div>}
            {editLoading ? (
              <div style={styles.loadingMsg}>Loading property...</div>
            ) : (
              <form onSubmit={handleSubmit} style={styles.form} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Property title *</label>
                  <input type="text" name="title" placeholder="Example: House in Bole" value={formData.title} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Description *</label>
                  <textarea name="description" placeholder="Enter a property description" value={formData.description} onChange={handleFormChange} required className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Price in ETB *</label>
                  <input type="number" name="price" placeholder="Price" min="1" value={formData.price} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-2 text-base font-bold text-slate-800">Address *</legend>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Region *</label>
                    <input type="text" name="region" placeholder="Region" value={formData.region} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Zone *</label>
                    <input type="text" name="zone" placeholder="Zone" value={formData.zone} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Wereda *</label>
                    <input type="text" name="wereda" placeholder="Wereda" value={formData.wereda} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">City *</label>
                    <input type="text" name="city" placeholder="City" value={formData.city} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Sub-city *</label>
                    <input type="text" name="subCity" placeholder="Sub-city" value={formData.subCity} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Kebele *</label>
                    <input type="text" name="kebele" placeholder="Kebele" value={formData.kebele} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">House Number *</label>
                    <input type="text" name="houseNumber" placeholder="House number" value={formData.houseNumber} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Number of bedrooms *</label>
                  <input type="number" name="bedrooms" placeholder="Number of bedrooms" min="1" value={formData.bedrooms} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-semibold text-slate-700">Property images (up to 5)</label>
                  {isEditMode && existingPropertyImages.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-2 text-sm font-medium text-slate-600">
                        Current house photos (kept unless you add photos below)
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {existingPropertyImages.map((image, index) => (
                          <PropertyImage
                            key={`${image}-${index}`}
                            src={image}
                            alt={`${formData.title || 'Property'} photo ${index + 1}`}
                            className="h-32 w-full rounded-lg border border-slate-200 bg-white object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    name="images"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    multiple
                    required={!isEditMode}
                    onChange={handleFileChange}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-700"
                  />
                  {imageFiles.length > 0 && <span className="block text-sm font-medium text-emerald-700"> {imageFiles.map((file) =>file.name).join(', ')}</span>}
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-semibold text-slate-700">Proof of ownership</label>
                  {existingProofOfOwnership && (
                    <>
                      <span className="block text-sm font-medium text-emerald-700"> {existingProofOfOwnership.split('/').pop()}</span>
                      <PropertyOwnershipProof
                        src={existingProofOfOwnership}
                        title={formData.title}
                        className="mt-2 grid gap-2 text-sm"
                        imageClassName="max-h-40 w-full rounded-lg object-contain"
                        showLabel={false}
                      />
                    </>
                  )}
                  <input
                    type="file"
                    name="document"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-700"
                  />
                  {documentFile && <span className="block text-sm font-medium text-emerald-700"> {documentFile.name}</span>}
                </div>

                <button type="submit" className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {isEditMode ? 'Save changes' : 'Submit property'}
                </button>
              </form>
            )}
        </div>
      )}
    </>
  );
};

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '30px 20px',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    color: '#2d3748',
    margin: '0 0 24px 0',
  },
  formCard: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
    marginBottom: '30px',
  },
  formHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  formTitle: {
    fontSize: '20px',
    margin: 0,
    color: '#2d3748',
  },
  formBackButton: {
    padding: '8px 12px',
    backgroundColor: '#edf2f7',
    color: '#2b6cb0',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  fieldLabel: {
    marginBottom: '-8px',
    color: '#2d3748',
    fontSize: '14px',
    fontWeight: '600',
  },
  input: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    fontSize: '16px',
  },
  textarea: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    fontSize: '16px',
    minHeight: '100px',
  },
  addressSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    margin: '2px 0',
  },
  addressLegend: {
    padding: '0 6px',
    color: '#2d3748',
    fontSize: '16px',
    fontWeight: '700',
  },
  fileSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fileLabel: {
    fontWeight: '600',
    color: '#2d3748',
    fontSize: '14px',
  },
  fileInput: {
    padding: '8px',
  },
  selectedFile: {
    color: '#22543d',
    fontSize: '13px',
    fontWeight: '600',
  },
  submitBtn: {
    padding: '12px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  errorMsg: {
    backgroundColor: '#fed7d7',
    color: '#9b2c2c',
    padding: '10px',
    borderRadius: '8px',
    marginBottom: '10px',
  },
  successMsg: {
    backgroundColor: '#c6f6d5',
    color: '#22543d',
    padding: '10px',
    borderRadius: '8px',
    marginBottom: '10px',
  },
  loadingMsg: {
    textAlign: 'center',
    color: '#718096',
    padding: '40px',
  },
};

export default LandlordDashboard;
