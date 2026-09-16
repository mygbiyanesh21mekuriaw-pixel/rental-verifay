import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LandlordSectionPage from './LandlordSectionPage';
import LandlordRequests from './LandlordRequests';
import LandlordPayments from './LandlordPayments';
import LandlordProfile from './LandlordProfile';
import LandlordNotifications from './LandlordNotifications';

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

  if (file.size > MAX_FILE_SIZE) {
    return 'File too large. Maximum allowed size is 10 MB per file.';
  }

  return '';
};

export const landlordSidebarItems = [
  { key: 'myProperties', label: 'My Properties', icon: '🏠', path: '/landlord/my-properties' },
  { key: 'verified', label: 'Verified Properties', icon: '✅', path: '/landlord/verified-properties' },
  { key: 'addProperty', label: 'Add Property', icon: '➕', path: '/landlord/add-property' },
  { key: 'rentalRequests', label: 'Rental Requests', icon: '📝', path: '/landlord/rental-requests' },
  { key: 'rented', label: 'Rented Properties', icon: '🏠', path: '/landlord/rented-properties' },
  { key: 'rentPayments', label: 'Rent Payments', icon: '💰', path: '/landlord/rent-payments' },
  { key: 'notifications', label: 'Notifications', icon: '🔔', path: '/landlord/notifications' },
  { key: 'profile', label: 'Profile', icon: '👤', path: '/landlord/profile' },
];

export const LandlordSidebar = ({ user, notificationCount = 0 }) => {
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
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[260px] translate-x-0 flex-col border-r border-slate-700 bg-slate-900 text-slate-200 shadow-lg">
        <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg text-white shadow-sm">🏠</div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Workspace</p>
            <h1 className="text-xl font-bold text-white">RentalVerify</h1>
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
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-slate-100">
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-slate-400">{user?.email || 'user@example.com'}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">👤 Landlord</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/', { replace: true });
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
    </aside>
  );
};

export const LandlordLayout = ({ children, user = null, notificationCount = 0 }) => (
  <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="pl-[260px]">
      <LandlordSidebar user={user} notificationCount={notificationCount} />
      <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </div>
  </div>
);

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
        const response = await axios.get(`http://localhost:5000/api/properties/${propertyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const property = response.data;
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
        const response = await axios.get('http://localhost:5000/api/notifications/unread-count', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setNotificationCount(Number(response.data?.count || 0));
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
          axios.get('http://localhost:5000/api/properties', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('http://localhost:5000/api/rental-requests/landlord-requests', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('http://localhost:5000/api/payments/landlord', { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const properties = Array.isArray(propertiesRes.data) ? propertiesRes.data : [];
        const landlordProperties = properties.filter((property) => String(property.landlord?._id || property.landlord) === String(user.id));
        const requests = Array.isArray(requestsRes.data) ? requestsRes.data : [];
        const payments = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];

        setOverviewStats({
          properties: landlordProperties.length,
          verified: landlordProperties.filter((property) => property.isVerified && property.verificationStatus === 'approved').length,
          rented: landlordProperties.filter((property) => property.availabilityStatus === 'rented').length,
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
      const invalidFile = chosenFiles.find((file) => getFileErrorMessage(file, 'Property image'));

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

    const imageValidationError = imageFiles.find((file) => getFileErrorMessage(file, 'Property image'));
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

        await axios.put(`http://localhost:5000/api/properties/${propertyId}`, formDataToSend, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
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

        await axios.post('http://localhost:5000/api/properties', formDataToSend, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      setFormSuccess(
        isEditMode
          ? '✅ Property updated successfully.'
          : '✅ Property submitted successfully! Verification is pending'
      );
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
      setDocumentFile(null);
      setShowForm(false);
      if (isEditMode) {
        setActiveSection('myProperties');
        navigate('/landlord/my-properties');
      } else {
        setActiveSection('underReview');
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
      { key: 'myProperties', label: 'My Properties', value: overviewStats.properties, icon: '🏠', path: '/landlord/my-properties', accent: 'bg-blue-50 text-blue-700' },
      { key: 'verified', label: 'Verified Properties', value: overviewStats.verified, icon: '✅', path: '/landlord/verified-properties', accent: 'bg-emerald-50 text-emerald-700' },
      { key: 'rentalRequests', label: 'Rental Requests', value: overviewStats.requests, icon: '📄', path: '/landlord/rental-requests', accent: 'bg-violet-50 text-violet-700' },
      { key: 'rented', label: 'Rented Properties', value: overviewStats.rented, icon: '🏘️', path: '/landlord/rented-properties', accent: 'bg-amber-50 text-amber-700' },
      { key: 'rentPayments', label: 'Rent Payments', value: overviewStats.payments, icon: '💰', path: '/landlord/rent-payments', accent: 'bg-cyan-50 text-cyan-700' },
      { key: 'notifications', label: 'Notifications', value: overviewStats.notifications, icon: '🔔', path: '/landlord/notifications', accent: 'bg-rose-50 text-rose-700' },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2 pb-1">
          <h2 className="text-[32px] font-bold tracking-tight text-slate-900">Landlord Dashboard</h2>
          <p className="text-base font-medium text-slate-600">Welcome back, {user?.name || 'Landlord'}.</p>
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
        <div className="mx-auto max-w-5xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="m-0 text-2xl font-bold text-slate-800">
              {isEditMode ? '✏️ Update property' : '🏠 Add a new property'}
            </h3>
          </div>

            {formError && <div style={styles.errorMsg}>{formError}</div>}
            {formSuccess && <div style={styles.successMsg}>{formSuccess}</div>}
            {editLoading ? (
              <div style={styles.loadingMsg}>Loading property...</div>
            ) : (
              <form onSubmit={handleSubmit} style={styles.form} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">🏠 Property title *</label>
                  <input type="text" name="title" placeholder="Example: House in Bole" value={formData.title} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">📝 Description *</label>
                  <textarea name="description" placeholder="Enter a property description" value={formData.description} onChange={handleFormChange} required className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">💰 Price in ETB *</label>
                  <input type="number" name="price" placeholder="Price" min="1" value={formData.price} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-2 text-base font-bold text-slate-800">📍 Address *</legend>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">📍 Region *</label>
                    <input type="text" name="region" placeholder="Region" value={formData.region} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">📍 Zone *</label>
                    <input type="text" name="zone" placeholder="Zone" value={formData.zone} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">📍 Wereda *</label>
                    <input type="text" name="wereda" placeholder="Wereda" value={formData.wereda} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">🏙️ City *</label>
                    <input type="text" name="city" placeholder="City" value={formData.city} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">🏙️ Sub-city *</label>
                    <input type="text" name="subCity" placeholder="Sub-city" value={formData.subCity} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">📍 Kebele *</label>
                    <input type="text" name="kebele" placeholder="Kebele" value={formData.kebele} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">🏠 House Number *</label>
                    <input type="text" name="houseNumber" placeholder="House number" value={formData.houseNumber} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">🚪 Number of bedrooms *</label>
                  <input type="number" name="bedrooms" placeholder="Number of bedrooms" min="1" value={formData.bedrooms} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-semibold text-slate-700">🖼️ Property images (up to 5)</label>
                  <input
                    type="file"
                    name="images"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFileChange}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-700"
                  />
                  {imageFiles.length > 0 && <span className="block text-sm font-medium text-emerald-700">✅ {imageFiles.map((file) => file.name).join(', ')}</span>}
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-semibold text-slate-700">📷 Proof of ownership</label>
                  {existingProofOfOwnership && (
                    <span className="block text-sm font-medium text-emerald-700">✅ {existingProofOfOwnership.split('/').pop()}</span>
                  )}
                  <input
                    type="file"
                    name="document"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-700"
                  />
                  {documentFile && <span className="block text-sm font-medium text-emerald-700">✅ {documentFile.name}</span>}
                </div>

                <button type="submit" className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {isEditMode ? '💾 Save changes' : '📤 Submit property'}
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
