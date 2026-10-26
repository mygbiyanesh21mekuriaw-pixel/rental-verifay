import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FaBell,
  FaCheck,
  FaFileAlt,
  FaHardHat,
  FaHome,
  FaMoneyBill,
} from 'react-icons/fa';
import LandlordSectionPage from './LandlordSectionPage';
import LandlordRequests from './LandlordRequests';
import LandlordPayments from './LandlordPayments';
import LandlordProfile from './LandlordProfile';
import LandlordNotifications from './LandlordNotifications';
import PropertyOwnershipProof from '../components/PropertyOwnershipProof';
import PropertyImage from '../components/PropertyImage';
import { getPropertyImages } from '../utils/propertyMedia';
import BackToPreviousPage from '../components/BackToPreviousPage';
import LandlordBackToDashboard from '../components/LandlordBackToDashboard';
import { useLanguage } from '../context/LanguageContext';
import DashboardLayout, { getDashboardMenuGroups, useDashboardLayout } from '../components/DashboardLayout';
import Navbar from '../components/Navbar';
import './landlordDashboard.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LandlordNotificationContext = React.createContext(0);
const EMPTY_PERMISSIONS = Object.freeze({});

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

const getRentalRequestStatus = (request) => (
  request.status === 'approved' || request.status === 'confirmed'
    ? 'Approved'
    : request.status === 'rejected'
      ? 'Rejected'
      : request.status === 'expired'
        ? 'Expired'
        : 'Pending'
);

const getRentalRequestDate = (createdAt, formatDate) => {
  const date = createdAt ? new Date(createdAt) : null;
  return date && !Number.isNaN(date.getTime())
    ? formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
};

export const LandlordLayout = ({ children, user: suppliedUser = null, notificationCount = 0 }) => {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const { t } = useLanguage();
  const dashboardLayout = useDashboardLayout();
  const [currentNotificationCount, setCurrentNotificationCount] = useState(notificationCount);
  const user = suppliedUser || authUser;
  const userId = user?.id;
  const canViewNotifications = user?.permissions?.notifications === true;
  const showBackToDashboard = [
    '/landlord/add-property',
    '/landlord/my-properties',
    '/landlord/verified-properties',
    '/landlord/rental-requests',
    '/landlord/rented-properties',
    '/landlord/under-review',
    '/landlord/under-review-properties',
    '/landlord/rejected',
    '/landlord/rejected-properties',
    '/landlord/rent-payments',
    '/landlord/bank-information',
    '/landlord/account-settings',
  ].includes(location.pathname);

  useEffect(() => {
    if (!userId) {
      setCurrentNotificationCount(0);
      return undefined;
    }
    if (!canViewNotifications) {
      setCurrentNotificationCount(0);
      return undefined;
    }

    let active = true;
    const fetchUnreadCount = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/notifications/unread-count`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (active) {
          setCurrentNotificationCount(
            Number(response.data?.unreadCount ?? response.data?.count ?? 0)
          );
        }
      } catch (error) {
        console.error('Unable to load landlord notification count:', error);
        if (active) setCurrentNotificationCount(null);
      }
    };

    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [canViewNotifications, userId]);

  const content = (
    <>
      {showBackToDashboard && <LandlordBackToDashboard />}
      {children}
    </>
  );
  const wrappedContent = dashboardLayout
    ? content
    : (
      <DashboardLayout
        header={<Navbar />}
        menuGroups={getDashboardMenuGroups(user, t)}
        user={user}
        title={t('Landlord')}
      >
        {content}
      </DashboardLayout>
    );

  return (
    <LandlordNotificationContext.Provider value={currentNotificationCount}>
      {wrappedContent}
    </LandlordNotificationContext.Provider>
  );
};

const LandlordDashboard = ({ initialShowForm = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const notificationCount = React.useContext(LandlordNotificationContext);
  const permissions = user?.permissions || EMPTY_PERMISSIONS;
  const userId = user?.id;
  const canViewNotifications = permissions.notifications === true;
  const { propertyId } = useParams();
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
    waitingRequests: 0,
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
  const [recentRequests, setRecentRequests] = useState([]);
  const [recentRequestsLoading, setRecentRequestsLoading] = useState(true);
  const [recentRequestsError, setRecentRequestsError] = useState(false);
  const [unavailablePermissions, setUnavailablePermissions] = useState({});
  const [documentFile, setDocumentFile] = useState(null);
  const [existingProofOfOwnership, setExistingProofOfOwnership] = useState(false);

  useEffect(() => {
    setShowForm(initialShowForm || isEditMode);
    if (initialShowForm) {
      setActiveSection('addProperty');
    }
    if (!isEditMode) {
      setExistingProofOfOwnership(false);
      return;
    }

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
        setExistingProofOfOwnership(Boolean(property.hasVerificationDocument));
      } catch (error) {
        setFormError(error.response?.data?.message || 'Unable to load property');
      } finally {
        setEditLoading(false);
      }
    };

    loadProperty();
  }, [initialShowForm, isEditMode, propertyId]);

  useEffect(() => {
    if (permissions.rentalRequests !== true) {
      setRecentRequests([]);
      setRecentRequestsError(false);
      setRecentRequestsLoading(false);
      return undefined;
    }

    let active = true;
    setRecentRequestsLoading(true);
    setRecentRequestsError(false);
    const loadRecentRequests = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/rental-requests/landlord-requests?limit=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!Array.isArray(response.data)) {
          throw new Error('Unexpected recent rental requests response');
        }
        if (active) setRecentRequests(response.data);
      } catch (error) {
        console.error('Unable to load recent landlord rental requests:', error);
        if (active) setRecentRequestsError(true);
      } finally {
        if (active) setRecentRequestsLoading(false);
      }
    };

    loadRecentRequests();
    return () => {
      active = false;
    };
  }, [permissions.rentalRequests, userId]);

  useEffect(() => {
    if (!userId) {
      setOverviewStats({
        properties: 0,
        verified: 0,
        rented: 0,
        requests: 0,
        waitingRequests: 0,
        payments: 0,
        notifications: 0,
      });
      setUnavailablePermissions({});
      return;
    }

    let active = true;
    setUnavailablePermissions({});
    const loadDashboardList = async (permissionKey, endpoint, label) => {
      if (permissions[permissionKey] !== true) return [];
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}${endpoint}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!Array.isArray(response.data)) {
          throw new Error(`Unexpected ${label} response`);
        }
        return response.data;
      } catch (error) {
        console.error(`Unable to load landlord dashboard ${label}:`, error);
        if (active) setUnavailablePermissions((current) => ({ ...current, [permissionKey]: true }));
        return [];
      }
    };

    const loadOverviewStats = async () => {
      const [properties, requests, payments] = await Promise.all([
        loadDashboardList('myProperties', '/api/properties', 'properties'),
        loadDashboardList('rentalRequests', '/api/rental-requests/landlord-requests', 'rental requests'),
        loadDashboardList('rentPayments', '/api/payments/landlord', 'rent payments'),
      ]);
      if (!active) return;

      const landlordProperties = properties.filter((property) => String(property.landlord?._id || property.landlord) === String(userId));
      setOverviewStats({
        properties: landlordProperties.length,
        verified: landlordProperties.filter((property) => property.isVerified && property.verificationStatus === 'approved').length,
        rented: landlordProperties.filter((property) => property.availabilityStatus === 'rented').length,
        requests: requests.length,
        waitingRequests: requests.filter((request) => String(request.status || '').trim().toLowerCase() === 'pending').length,
        payments: payments.length,
        notifications: canViewNotifications && Number.isFinite(notificationCount) ? notificationCount : 0,
      });
    };

    loadOverviewStats();
    return () => {
      active = false;
    };
  }, [canViewNotifications, notificationCount, permissions, userId]);

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

        const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/properties`, formDataToSend, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
        setFormSuccess(response.data?.message || 'Property submitted successfully! Verification is pending');
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
    const today = new Date();
    const todayDateTime = new Date(
      today.getTime() - today.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);
    const cards = [
      { key: 'myProperties', permissionKey: 'myProperties', label: 'My Properties', value: overviewStats.properties, icon: <FaHome aria-hidden="true" />, path: '/landlord/my-properties', accent: 'bg-blue-50 text-blue-700' },
      { key: 'verified', permissionKey: 'verifiedProperties', dataPermissionKey: 'myProperties', label: 'Verified Properties', value: overviewStats.verified, icon: <FaCheck aria-hidden="true" />, path: '/landlord/verified-properties', accent: 'bg-[#1d4ed8] text-white' },
      { key: 'rentalRequests', permissionKey: 'rentalRequests', label: 'Rental Requests', value: overviewStats.requests, icon: <FaFileAlt aria-hidden="true" />, path: '/landlord/rental-requests', accent: 'bg-blue-50 text-blue-700' },
      { key: 'rented', permissionKey: 'rentedProperties', dataPermissionKey: 'myProperties', label: 'Rented Properties', value: overviewStats.rented, icon: <FaHardHat aria-hidden="true" />, path: '/landlord/rented-properties', accent: 'bg-amber-50 text-amber-700' },
      { key: 'rentPayments', permissionKey: 'rentPayments', label: 'Rent Payments', value: overviewStats.payments, icon: <FaMoneyBill aria-hidden="true" />, path: '/landlord/rent-payments', accent: 'bg-cyan-50 text-cyan-700' },
      { key: 'notifications', permissionKey: 'notifications', label: 'Notifications', value: overviewStats.notifications, icon: <FaBell aria-hidden="true" />, path: '/landlord/notifications', accent: 'bg-rose-50 text-rose-700' },
    ].filter((card) => (
      permissions[card.permissionKey] === true &&
      permissions[card.dataPermissionKey || card.permissionKey] === true &&
      unavailablePermissions[card.dataPermissionKey || card.permissionKey] !== true &&
      (card.key !== 'notifications' || Number.isFinite(notificationCount))
    ));

    return (
      <div className="w-full min-w-0 space-y-6">
        <div className="dashboard-welcome-banner !m-0 !min-w-0 !flex !flex-row !flex-wrap !items-center !justify-between !gap-2 !rounded-2xl !border-0 !bg-green-700 !px-4 !py-4 !shadow-sm md:!px-6">
          <h1 className="landlord-dashboard-title !text-xl !leading-tight !text-white sm:!text-2xl">
            {t('Welcome back, ')}{user?.name || t('Landlord')}
          </h1>
          <time className="ml-auto text-right text-xs font-medium leading-snug text-white/90" dateTime={todayDateTime}>
            {formatDate(today, { dateStyle: 'full' })}
          </time>
        </div>

        <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.key}
              to={card.path}
              className="group flex h-full min-h-[132px] min-w-0 cursor-pointer items-stretch rounded-2xl border border-slate-200 bg-white p-4 text-left text-inherit no-underline shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              <div className="flex h-full w-full items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <p className="text-sm font-medium text-slate-500">{t(card.label)}</p>
                  <div>
                    {card.key === 'rentalRequests' && (
                      <div>
                        <p className="m-0 text-3xl font-bold tracking-tight text-slate-900">
                          {t('{{count}} total', { count: card.value })}
                        </p>
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          {t('{{count}} pending', { count: overviewStats.waitingRequests })}
                        </span>
                      </div>
                    )}
                    {card.key !== 'rentalRequests' && (
                      <p className="text-3xl font-bold tracking-tight text-slate-900">{card.value}</p>
                    )}
                    {card.key === 'notifications' && (
                      <span className="mt-1 block text-sm font-medium text-slate-500">{t('Unread')}</span>
                    )}
                  </div>
                </div>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl shadow-sm ring-1 ring-slate-200 ${card.accent}`}>
                  {card.icon}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {permissions.rentalRequests === true && unavailablePermissions.rentalRequests !== true && !recentRequestsError && <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="landlord-recent-requests-title">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
            <h3 id="landlord-recent-requests-title" className="m-0 min-w-0 text-base font-bold text-slate-900 sm:text-lg">{t('Recent Rental Requests')}</h3>
            <Link to="/landlord/rental-requests" className="shrink-0 rounded font-semibold text-[var(--rv-dashboard-topbar)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rv-dashboard-topbar)] focus-visible:ring-offset-2">
              {t('View all')}
            </Link>
          </div>
          {recentRequestsLoading ? (
            <div className="space-y-3 p-4 sm:p-5" role="status" aria-label={t('Loading recent rental requests...')}>
              {[0, 1, 2].map((row) => (
                <div key={row} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <span className="h-4 animate-pulse rounded bg-slate-200" />
                  <span className="h-4 animate-pulse rounded bg-slate-200" />
                  <span className="h-4 animate-pulse rounded bg-slate-200" />
                  <span className="h-4 animate-pulse rounded bg-slate-200" />
                </div>
              ))}
              <span className="sr-only">{t('Loading recent rental requests...')}</span>
            </div>
          ) : recentRequestsError ? (
            <p className="m-0 p-6 text-sm text-red-700" role="alert">
              {t('Unable to load recent rental requests.')}
            </p>
          ) : recentRequests.length === 0 ? (
            <p className="m-0 p-6 text-sm text-slate-500">{t('No requests yet')}</p>
          ) : (
            <>
              <div className="space-y-3 p-3 lg:hidden">
                {recentRequests.map((request) => {
                  const status = getRentalRequestStatus(request);
                  const statusColor = status === 'Approved'
                    ? 'bg-green-100 text-green-800'
                    : status === 'Rejected'
                      ? 'bg-red-100 text-red-800'
                      : status === 'Expired'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-amber-100 text-amber-800';

                  return (
                    <article key={request._id} className="min-w-0 rounded-xl border border-slate-200 p-3">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="m-0 truncate text-sm font-semibold text-slate-900">{request.tenant?.name || request.tenantName || '—'}</p>
                          <p className="m-0 mt-1 truncate text-sm text-slate-600">{request.property?.title || '—'}</p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold ${statusColor}`}>
                          {t(status)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <p className="m-0 min-w-0 truncate text-xs text-slate-500">
                          {t('Date')}: {getRentalRequestDate(request.createdAt, formatDate)}
                        </p>
                        <Link
                          to={`/landlord/rental-requests/${request._id}`}
                          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-[var(--rv-dashboard-topbar)] px-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-[var(--rv-dashboard-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rv-dashboard-topbar)] focus-visible:ring-offset-2"
                        >
                          {t('View')}
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="hidden w-full max-w-full overflow-x-auto lg:block">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-left" aria-label={t('Recent Rental Requests')}>
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[30%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-3 sm:px-4">{t('Tenant')}</th>
                    <th scope="col" className="px-3 py-3 sm:px-4">{t('Property')}</th>
                    <th scope="col" className="px-3 py-3 sm:px-4">{t('Date')}</th>
                    <th scope="col" className="px-3 py-3 sm:px-4">{t('Status')}</th>
                    <th scope="col" className="px-2 py-3 text-right"><span className="sr-only">{t('View')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
                  {recentRequests.map((request) => {
                    const status = getRentalRequestStatus(request);

                    return (
                      <tr key={request._id}>
                        <td className="truncate px-3 py-3 sm:px-4">{request.tenant?.name || request.tenantName || '—'}</td>
                        <td className="truncate px-3 py-3 sm:px-4">{request.property?.title || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3 sm:px-4">{getRentalRequestDate(request.createdAt, formatDate)}</td>
                        <td className="px-3 py-3 sm:px-4">
                          <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
                            status === 'Approved'
                              ? 'bg-green-100 text-green-800'
                              : status === 'Rejected'
                                ? 'bg-red-100 text-red-800'
                                : status === 'Expired'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-amber-100 text-amber-800'
                          }`}>
                            {t(status)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <Link
                            to={`/landlord/rental-requests/${request._id}`}
                            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[var(--rv-dashboard-topbar)] px-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-[var(--rv-dashboard-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rv-dashboard-topbar)] focus-visible:ring-offset-2"
                          >
                            {t('View')}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </section>}
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
        <div className="w-full min-w-0">
          {isEditMode && <BackToPreviousPage />}
          <div className="mb-3">
            <h3 className="m-0 text-2xl font-bold text-slate-800">
              {isEditMode ? 'Update property' : 'Add a new property'}
            </h3>
          </div>

            {formError && <div style={styles.errorMsg}>{formError}</div>}
            {formSuccess && <div style={styles.successMsg}>{formSuccess}</div>}
            {editLoading ? (
              <div style={styles.loadingMsg}>Loading property...</div>
            ) : (
              <form onSubmit={handleSubmit} style={styles.form} className="landlord-property-form-fields space-y-5">
                <div className="landlord-property-field space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Property title *</label>
                  <input type="text" name="title" placeholder="Example: House in Bole" value={formData.title} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="landlord-property-field space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Description *</label>
                  <textarea name="description" placeholder="Enter a property description" value={formData.description} onChange={handleFormChange} required className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <div className="landlord-property-field space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Price in ETB *</label>
                  <input type="number" name="price" placeholder="Price" min="1" value={formData.price} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                </div>

                <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-2 text-base font-bold text-slate-800">Address *</legend>
                  <div className="landlord-property-field space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Region *</label>
                    <input type="text" name="region" placeholder="Region" value={formData.region} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="landlord-property-field space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Zone *</label>
                    <input type="text" name="zone" placeholder="Zone" value={formData.zone} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="landlord-property-field space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Wereda *</label>
                    <input type="text" name="wereda" placeholder="Wereda" value={formData.wereda} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="landlord-property-field space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">City *</label>
                    <input type="text" name="city" placeholder="City" value={formData.city} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="landlord-property-field space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Sub-city *</label>
                    <input type="text" name="subCity" placeholder="Sub-city" value={formData.subCity} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="landlord-property-field space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Kebele *</label>
                    <input type="text" name="kebele" placeholder="Kebele" value={formData.kebele} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>

                  <div className="landlord-property-field space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">House Number *</label>
                    <input type="text" name="houseNumber" placeholder="House number" value={formData.houseNumber} onChange={handleFormChange} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                  </div>
                </fieldset>

                <div className="landlord-property-field space-y-2">
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
                      <PropertyOwnershipProof
                        propertyId={propertyId}
                        hasProof={existingProofOfOwnership}
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
