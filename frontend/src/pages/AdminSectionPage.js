import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaArrowDown,
  FaEdit,
  FaEye,
  FaEyeSlash,
  FaKey,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import BackToDashboard from '../components/BackToDashboard';
import PropertyImage from '../components/PropertyImage';
import PropertyOwnershipProof from '../components/PropertyOwnershipProof';
import { getPropertyImages } from '../utils/propertyMedia';
import { apiUrl } from '../utils/apiUrl';
import { useLanguage } from '../context/LanguageContext';
import './adminDashboard.css';

const sectionConfig = {
  awaitingVerification: { title: 'Properties awaiting verification', endpoint: 'pending-properties' },
  allProperties: { title: 'Properties', status: 'all' },
  pending: { title: 'Under Review', endpoint: 'pending-properties' },
  reviewProperties: { title: 'Under Review', status: 'pending' },
  rentalRequests: { title: 'Rental Requests', endpoint: 'rental-requests/admin-requests' },
  rejected: { title: 'Rejected', status: 'rejected' },
  allUsers: { title: 'All users', endpoint: 'users' },
  adminManagement: { title: 'Admin Management', endpoint: 'users' },
  paymentPeriod: { title: 'Payment Period', endpoint: 'payment-periods' },
  demoBankAccounts: { title: 'DEMO Bank Accounts', endpoint: 'demo-bank-accounts' },
  verified: { title: 'Verified Properties', status: 'approved' },
};

const displayVerificationStatus = (property) => {
  if (property.isVerified && property.verificationStatus === 'approved') return 'Verified';
  if (!property.isVerified && property.verificationStatus === 'rejected') return 'Rejected';
  if (!property.isVerified && property.verificationStatus === 'pending') return 'Under Review';
  return property.verificationStatus || 'Unknown';
};

const getAdminAreaValue = (adminAreas) => {
  const firstArea = Array.isArray(adminAreas) ? adminAreas[0] : null;
  if (!firstArea) return '';
  if (typeof firstArea === 'string') return firstArea;
  return firstArea.city || firstArea.region || firstArea.zone || firstArea.wereda || firstArea.subCity || '';
};

const getDisplayUserRole = (user) => {
  if (user.role !== 'admin') return user.role;
  return user.adminType === 'area' || (!user.adminType && user.adminAreas?.length > 0)
    ? 'area_admin'
    : 'platform_admin';
};

const AdminSectionPage = ({ type }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuth();
  const { t, formatDate } = useLanguage();
  const config = sectionConfig[type];
  const isAdminManagementPage = type === 'adminManagement';
  const isUserListPage = type === 'allUsers';
  const isAreaAdminPropertySection = currentUser?.role === 'admin'
    && currentUser?.adminType === 'area'
    && ['allProperties', 'pending', 'reviewProperties', 'awaitingVerification', 'rejected', 'verified', 'rentalRequests'].includes(type);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [userActionFeedback, setUserActionFeedback] = useState(null);
  const [userRoleTab, setUserRoleTab] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    adminType: 'area',
    area: '',
  });
  const [adminFormError, setAdminFormError] = useState('');
  const [adminFormMessage, setAdminFormMessage] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [adminNoticeType, setAdminNoticeType] = useState('success');
  const adminNoticeTimeout = useRef(null);
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  const [areas, setAreas] = useState([]);
  const [areaError, setAreaError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetAdminId, setResetAdminId] = useState(null);
  const [resetTemporaryPassword, setResetTemporaryPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [adminFormOpen, setAdminFormOpen] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminStatusFilter, setAdminStatusFilter] = useState('all');
  const [adminPage, setAdminPage] = useState(1);
  const [openAdminMenuId, setOpenAdminMenuId] = useState(null);
  const adminMenuTriggerRefs = useRef({});
  const adminMenuPanelRef = useRef(null);
  const [adminMenuPosition, setAdminMenuPosition] = useState(null);
  const newAreaAdminTriggerRef = useRef(null);
  const adminModalReturnFocusRef = useRef(null);
  const adminModalRef = useRef(null);
  const adminFormLoadingRef = useRef(adminFormLoading);
  adminFormLoadingRef.current = adminFormLoading;
  const [adminActionLoading, setAdminActionLoading] = useState(null);
  const [demotionAdmin, setDemotionAdmin] = useState(null);
  const [demotionRole, setDemotionRole] = useState('');
  const [promotionUser, setPromotionUser] = useState(null);
  const [promotionArea, setPromotionArea] = useState('');
  const [selectedRentalRequest, setSelectedRentalRequest] = useState(null);
  const [rentalRequestFeedback, setRentalRequestFeedback] = useState('');
  const isPlatformAdmin = currentUser?.role === 'admin'
    && (!currentUser.adminType || currentUser.adminType === 'platform');
  const showPlatformAdminBackLink = isPlatformAdmin
    && ['allUsers', 'paymentPeriod', 'adminManagement'].includes(type);
  const showAreaAdminBackLink = currentUser?.role === 'admin'
    && currentUser?.adminType === 'area'
    && ['verified', 'rejected', 'pending', 'allProperties', 'rentalRequests'].includes(type);
  const canManageVerification = currentUser?.role === 'admin'
    && currentUser?.adminType === 'area'
    && (type === 'pending' || type === 'reviewProperties' || type === 'awaitingVerification');
  const canManageRentalRequests = currentUser?.role === 'admin' && currentUser?.adminType === 'area';

  useEffect(() => () => {
    if (adminNoticeTimeout.current) {
      window.clearTimeout(adminNoticeTimeout.current);
    }
  }, []);

  const showAdminNotice = (message, type = 'success') => {
    if (adminNoticeTimeout.current) {
      window.clearTimeout(adminNoticeTimeout.current);
    }
    setAdminNoticeType(type);
    setAdminNotice(message);
    adminNoticeTimeout.current = window.setTimeout(() => {
      setAdminNotice('');
      adminNoticeTimeout.current = null;
    }, 8000);
  };

  const dismissAdminNotice = () => {
    if (adminNoticeTimeout.current) {
      window.clearTimeout(adminNoticeTimeout.current);
      adminNoticeTimeout.current = null;
    }
    setAdminNotice('');
  };

  const getAreaHandoverConfirmation = (admin) => {
    const areaName = admin.assignedArea || getAdminAreaValue(admin.adminAreas);
    const area = areas.find((entry) => String(entry.name).toLowerCase() === String(areaName).toLowerCase());
    const count = Number(area?.waitingItemCount || 0);
    return t('{count} unfinished items will stay in {area} until a new admin is assigned. Completed work stays in history.')
      .replace('{count}', String(count))
      .replace('{area}', areaName || 'their area');
  };

  const getAreaAdminFor = (areaName, ignoredAdminId = null) => items.find((admin) => {
    if (!admin || admin.role !== 'admin' || admin.adminType !== 'area') return false;
    if (ignoredAdminId && String(admin._id) === String(ignoredAdminId)) return false;
    const assignedArea = admin.assignedArea || getAdminAreaValue(admin.adminAreas);
    return String(assignedArea).trim().toLowerCase() === String(areaName).trim().toLowerCase();
  });

  const fetchAreas = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await Promise.resolve().then(() => axios.get(apiUrl('/api/areas'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }));
      setAreas(Array.isArray(response.data) ? response.data : []);
      setAreaError('');
    } catch (error) {
      console.error('Unable to load areas:', error);
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message || 'Unknown error.';
      setAreaError(`${status ? `HTTP ${status}: ` : ''}${message}`);
    }
  }, []);

  useEffect(() => {
    if ((isAdminManagementPage || isUserListPage) && isPlatformAdmin) fetchAreas();
  }, [fetchAreas, isAdminManagementPage, isPlatformAdmin, isUserListPage]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      let endpoint = config.endpoint
        ? type === 'rentalRequests'
          ? `${process.env.REACT_APP_API_URL}/api/${config.endpoint}`
          : `${process.env.REACT_APP_API_URL}/api/admin/${config.endpoint}`
        : `${process.env.REACT_APP_API_URL}/api/admin/properties?status=${config.status}`;

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const records = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.properties) ? response.data.properties : [];
      setItems(isAdminManagementPage
        ? records.filter(user =>user && user._id != null && user.role === 'admin' && user.adminType === 'area')
        : records.filter(property =>property && property._id != null));
    } catch (error) {
      console.error('Error fetching admin section:', error);
      setItems([]);
      const responseStatus = error.response?.status;
      const responseMessage = error.response?.data?.message;
      const defaultMessage = type === 'rentalRequests'
        ? 'Unable to load rental requests.'
        : 'Unable to load admin records.';
      setLoadError(type === 'rentalRequests' && responseStatus
        ? `${responseMessage || defaultMessage} (HTTP ${responseStatus})`
        : responseMessage || defaultMessage);
    } finally {
      setLoading(false);
    }
  }, [config, type, isAdminManagementPage]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredAreaAdmins = isAdminManagementPage
    ? items.filter((admin) => {
      const search = adminSearch.trim().toLocaleLowerCase();
      const areaName = admin.assignedArea || getAdminAreaValue(admin.adminAreas);
      const matchesSearch = !search || [
        admin.name,
        admin.email,
        admin.phone,
        areaName,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(search));
      const matchesStatus = adminStatusFilter === 'all'
        || (adminStatusFilter === 'active' && admin.isActive !== false)
        || (adminStatusFilter === 'inactive' && admin.isActive === false);
      return matchesSearch && matchesStatus;
    })
    : [];
  const adminPageSize = 10;
  const adminPageCount = Math.max(1, Math.ceil(filteredAreaAdmins.length / adminPageSize));
  const visibleAreaAdmins = filteredAreaAdmins.slice(
    (adminPage - 1) * adminPageSize,
    adminPage * adminPageSize,
  );
  const normalizedUsers = isUserListPage
    ? items.map((user) => ({ ...user, displayRole: getDisplayUserRole(user) }))
    : [];
  const userRoleCounts = normalizedUsers.reduce((counts, user) => {
    counts.all += 1;
    if (counts[user.displayRole] !== undefined) counts[user.displayRole] += 1;
    return counts;
  }, { all: 0, landlord: 0, tenant: 0, area_admin: 0, platform_admin: 0 });
  const filteredUsers = normalizedUsers.filter((user) => {
    const matchesRole = userRoleTab === 'all' || user.displayRole === userRoleTab;
    const matchesStatus = userStatusFilter === 'all'
      || (userStatusFilter === 'active' && user.isActive !== false)
      || (userStatusFilter === 'inactive' && user.isActive === false);
    const search = userSearch.trim().toLocaleLowerCase();
    const matchesSearch = !search || [user.name, user.email, user.phone]
      .some((value) => String(value || '').toLocaleLowerCase().includes(search));
    return matchesRole && matchesStatus && matchesSearch;
  });
  const userPageSize = 10;
  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const visibleUsers = filteredUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize);

  useEffect(() => {
    setAdminPage((currentPage) => Math.min(currentPage, adminPageCount));
  }, [adminPageCount]);

  useEffect(() => {
    setUserPage((currentPage) => Math.min(currentPage, userPageCount));
  }, [userPageCount]);

  const closeAdminMenu = useCallback((restoreFocus = true) => {
    if (restoreFocus && openAdminMenuId) {
      adminMenuTriggerRefs.current[openAdminMenuId]?.focus();
    }
    setOpenAdminMenuId(null);
    setAdminMenuPosition(null);
  }, [openAdminMenuId]);

  useEffect(() => {
    if (!openAdminMenuId) return undefined;
    const trigger = adminMenuTriggerRefs.current[openAdminMenuId];
    const panel = adminMenuPanelRef.current;
    if (!trigger || !panel) return undefined;

    const updatePosition = () => {
      const triggerRect = trigger.getBoundingClientRect();
      const panelHeight = panel.getBoundingClientRect().height || 132;
      const panelWidth = panel.getBoundingClientRect().width || 176;
      const gap = 6;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const placement = spaceBelow < panelHeight + gap && spaceAbove > spaceBelow ? 'above' : 'below';
      const top = placement === 'above'
        ? Math.max(8, triggerRect.top - panelHeight - gap)
        : Math.max(8, Math.min(window.innerHeight - panelHeight - 8, triggerRect.bottom + gap));
      const left = Math.max(8, Math.min(
        window.innerWidth - panelWidth - 8,
        triggerRect.right - panelWidth,
      ));
      setAdminMenuPosition({ top, left, placement });
    };
    const handlePointerDown = (event) => {
      if (!panel.contains(event.target) && !trigger.contains(event.target)) closeAdminMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAdminMenu(true);
      }
    };
    const handleScroll = () => closeAdminMenu();

    updatePosition();
    panel.querySelector('[role="menuitem"]')?.focus();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [closeAdminMenu, openAdminMenuId]);

  useEffect(() => {
    if (!adminFormOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!adminModalReturnFocusRef.current) {
      adminModalReturnFocusRef.current = document.activeElement;
    }
    const handleModalKeyDown = (event) => {
      if (event.key === 'Escape' && !adminFormLoadingRef.current) {
        handleCancelAdminEdit();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = adminModalRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableElements?.length) {
        event.preventDefault();
        adminModalRef.current?.focus();
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    document.addEventListener('keydown', handleModalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleModalKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (adminModalReturnFocusRef.current?.isConnected) {
        adminModalReturnFocusRef.current.focus();
      }
      adminModalReturnFocusRef.current = null;
    };
  }, [adminFormOpen]);

  const handlePropertyAction = async (propertyId, action) => {
    setActionLoading(propertyId);
    const endpoint = `${process.env.REACT_APP_API_URL}/api/admin/${action}-property/${propertyId}`;
    const payload = action === 'reject' ? { comment: 'Documentation insufficient' } : {};
    console.info('Admin property action', { method: 'PUT', endpoint, propertyId, payload });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } });
      console.info('Admin property action succeeded', { method: 'PUT', endpoint, propertyId, status: response.status });
      await fetchItems();
    } catch (error) {
      const status = error.response?.status || 'no response';
      const message = error.response?.data?.message || error.message || 'Unable to update property';
      console.error('Admin property action failed', { method: 'PUT', endpoint, propertyId, payload, status, message });
      alert(`${message} (HTTP ${status})`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRentalRequestAction = async (requestId, status) => {
    setActionLoading(requestId);
    setRentalRequestFeedback('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${process.env.REACT_APP_API_URL}/api/rental-requests/admin-requests/${requestId}/respond`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await fetchItems();
      setSelectedRentalRequest((current) =>current && current._id === requestId
        ? { ...current, status: response.data?.request?.status || status }
        : current);
      setRentalRequestFeedback(response.data?.message || `Rental request ${status}.`);
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Unable to update rental request';
      setRentalRequestFeedback(message);
    } finally {
      setActionLoading(null);
    }
  };

  const openRentalRequestDetails = async (request) => {
    setSelectedRentalRequest(request);
    setRentalRequestFeedback('');

    if (!request.property?._id) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/properties/${request.property._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedRentalRequest((current) =>current && current._id === request._id
        ? { ...current, property: { ...current.property, ...response.data } }
        : current);
    } catch (error) {
      console.warn('Unable to load full property details for rental request:', error);
    }
  };

  const handleAdminFormChange = (event) => {
    const { name, value } = event.target;
    setAdminForm((current) => ({ ...current, [name]: value }));
  };

  const handleEditAdmin = (admin) => {
    adminModalReturnFocusRef.current = adminMenuTriggerRefs.current[admin._id];
    setEditingAdminId(admin._id);
    setAdminFormOpen(true);
    setShowPassword(false);
    setAdminForm({
      name: admin.name || '',
      email: admin.email || '',
      username: admin.username || '',
      phone: admin.phone || '',
      password: '',
      adminType: 'area',
      area: admin.assignedArea || getAdminAreaValue(admin.adminAreas),
    });
    setAdminFormError('');
    setAdminFormMessage('');
  };

  const handleCancelAdminEdit = () => {
    setEditingAdminId(null);
    setAdminFormOpen(false);
    setShowPassword(false);
    setAdminForm({ name: '', email: '', username: '', phone: '', password: '', adminType: 'area', area: '' });
    setAdminFormError('');
    setAdminFormMessage('');
    if (adminModalReturnFocusRef.current?.isConnected) {
      adminModalReturnFocusRef.current.focus();
    }
  };

  const handleAdminSubmit = async (event) => {
    event.preventDefault();
    setAdminFormError('');
    setAdminFormMessage('');
    setAdminFormLoading(true);
    try {
      const payload = {
        email: adminForm.email,
        phone: adminForm.phone,
      };
      if (!editingAdminId) {
        payload.fullName = adminForm.name;
        payload.area = adminForm.area;
        payload.username = adminForm.username;
        payload.tempPassword = adminForm.password;
      } else {
        payload.name = adminForm.name;
        payload.assignedArea = adminForm.area;
      }
      const token = localStorage.getItem('token');
      const endpoint = editingAdminId
        ? `${process.env.REACT_APP_API_URL}/api/admin/users/admin/${editingAdminId}`
        : `${process.env.REACT_APP_API_URL}/api/admin/area-admins`;
      const response = editingAdminId
        ? await axios.put(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } })
        : await axios.post(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } });
      const wasEditing = Boolean(editingAdminId);
      const successMessage = response.data?.message || 'Area Admin updated successfully.';
      handleCancelAdminEdit();
      if (wasEditing) setAdminFormMessage(successMessage);
      else if (response.data?.user?._id) {
        navigate(`/admin-dashboard/users-permissions?userId=${encodeURIComponent(response.data.user._id)}`);
      } else {
        showAdminNotice(t('Admin created. Please give the temporary password to the admin directly. They must change it on first login.'));
      }
      await fetchItems();
    } catch (error) {
      setAdminFormError(error.response?.data?.message || 'Unable to create admin account.');
    } finally {
      setAdminFormLoading(false);
    }
  };

  const openCreateAdminForm = () => {
    adminModalReturnFocusRef.current = newAreaAdminTriggerRef.current || document.activeElement;
    handleCancelAdminEdit();
    setAdminFormError('');
    setAdminFormMessage('');
    setAdminFormOpen(true);
  };

  const handleSetAdminActive = async (admin, isActive) => {
    if (!isActive && !window.confirm(
      `${getAreaHandoverConfirmation(admin)}\n\n${t('Deactivate')} ${admin.name}?`,
    )) return;

    setAdminActionLoading(admin._id);
    dismissAdminNotice();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(
        apiUrl(`/api/admin/users/admin/${admin._id}/active`),
        { isActive },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showAdminNotice(response.data?.message || t(isActive ? 'Area Admin activated successfully.' : 'Area Admin deactivated successfully.'));
      await fetchItems();
    } catch (error) {
      showAdminNotice(error.response?.data?.message || t('Unable to update Area Admin status.'), 'error');
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleDemoteAdmin = async () => {
    if (!demotionAdmin || !demotionRole) return;
    const admin = demotionAdmin;
    setAdminActionLoading(admin._id);
    dismissAdminNotice();
    try {
      const token = localStorage.getItem('token');
      const endpoint = apiUrl(`/api/admin/users/${admin._id}/role`);
      const headers = { headers: { Authorization: `Bearer ${token}` } };
      const payload = { role: demotionRole };
      let response;
      try {
        response = await axios.put(endpoint, payload, headers);
      } catch (error) {
        const duplicate = error.response?.data;
        if (duplicate?.code === 'EXISTING_ACCOUNT_ROLE_MISMATCH') {
          const existingRole = t(duplicate.existingAccountRole === 'landlord' ? 'Landlord' : 'Tenant');
          showAdminNotice(t('This email belongs to an existing {role} account. Select {role} to use that account.')
            .replace(/\{role\}/g, existingRole), 'error');
          return;
        }
        const existingRole = t(duplicate?.existingAccountRole === 'landlord' ? 'Landlord' : 'Tenant');
        const confirmationMessage = t('An existing {role} account uses this email. Confirm to deactivate this Area Admin and use the existing account.')
          .replace(/\{role\}/g, existingRole);
        if (duplicate?.code !== 'EXISTING_ACCOUNT_CONFIRMATION_REQUIRED'
          || !window.confirm(confirmationMessage)) {
          throw error;
        }
        response = await axios.put(endpoint, {
          ...payload,
          confirmExistingAccount: true,
          existingAccountId: duplicate.existingAccountId,
        }, headers);
      }
      const successMessage = demotionRole === 'deactivate'
        ? 'Area Admin deactivated successfully.'
        : response.data?.user?.id
          ? 'Existing {role} account selected. The Area Admin account is deactivated.'
          : `Area Admin demoted to ${demotionRole === 'landlord' ? 'Landlord' : 'Tenant'}.`;
      showAdminNotice(t(successMessage).replace('{role}', t(demotionRole === 'landlord' ? 'Landlord' : 'Tenant')));
      setDemotionAdmin(null);
      setDemotionRole('');
      await fetchItems();
    } catch (error) {
      showAdminNotice(error.response?.data?.message || t('Unable to demote Area Admin.'), 'error');
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handlePromoteUser = async () => {
    if (!promotionUser || !promotionArea) return;
    const user = promotionUser;
    setAdminActionLoading(user._id);
    dismissAdminNotice();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        apiUrl(`/api/admin/users/${user._id}/role`),
        { role: 'area_admin', assignedArea: promotionArea },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showAdminNotice(response.data?.message || t('Area Admin promotion successful.'));
      setPromotionUser(null);
      setPromotionArea('');
      await fetchItems();
    } catch (error) {
      showAdminNotice(error.response?.data?.message || t('Unable to promote user to Area Admin.'), 'error');
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleResetAdminPassword = async (admin) => {
    setAdminActionLoading(admin._id);
    setAdminFormError('');
    setAdminFormMessage('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        apiUrl(`/api/admins/${admin._id}/reset-password`),
        { temporaryPassword: resetTemporaryPassword },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showAdminNotice(t('Password reset. Please give the new temporary password to the admin directly. They must change it on next login.'));
      setResetAdminId(null);
      setResetTemporaryPassword('');
      setShowResetPassword(false);
      await fetchItems();
    } catch (error) {
      showAdminNotice(error.response?.data?.message || t('Unable to reset Area Admin password.'), 'error');
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleUserActiveChange = async (targetUser) => {
    const isActive = targetUser.isActive === false;
    const confirmed = window.confirm(t(
      isActive
        ? 'Activate this user and allow them to log in again?'
        : 'Deactivate this user and block them from logging in?',
    ));
    if (!confirmed) return;

    setAdminActionLoading(targetUser._id);
    setUserActionFeedback(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(
        apiUrl(`/api/admin/users/${targetUser._id}/active`),
        { isActive },
        { headers: { Authorization: 'Bearer ' + token } },
      );
      setItems((currentItems) =>currentItems.map((item) => (
        String(item._id) === String(targetUser._id) ? { ...item, isActive } : item
      )));
      setUserActionFeedback({
        type: 'success',
        message: response.data?.message || (isActive ? 'User activated successfully.' : 'User deactivated successfully.'),
      });
    } catch (error) {
      setUserActionFeedback({
        type: 'error',
        message: error.response?.data?.message || error.message || 'Unable to update user status.',
      });
    } finally {
      setAdminActionLoading(null);
    }
  };

  if (!config) return null;

  return (
    <div className={`admin-container admin-section-page${isAreaAdminPropertySection ? ' admin-section-area' : ''}`}>
      {showPlatformAdminBackLink && (
        <BackToDashboard dashboardRoute="/admin-dashboard" />
      )}
      {showAreaAdminBackLink && (
        <BackToDashboard
          dashboardRoute="/admin-dashboard"
          label="← Back to Dashboard"
        />
      )}
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-gradient">{config.title}</span>
            </h1>
            <p className="admin-subtitle">Admin management</p>
          </div>
          {!showPlatformAdminBackLink && !showAreaAdminBackLink && (
            <button
              type="button"
              className="admin-close-btn admin-back-dashboard"
              onClick={() =>navigate('/admin-dashboard')}
            >Back to Admin Dashboard
            </button>
          )}
        </div>
      </div>

      {isAdminManagementPage && isPlatformAdmin && (
        <section className="admin-detail-section admin-dedicated-content admin-management-panel">
          <div className="admin-management-toolbar">
            <div>
              <h2 className="admin-card-title">{t('Area Admins')}</h2>
              <p className="admin-subtitle">{t('Only the Platform Admin can create area-specific admin accounts.')}</p>
            </div>
            <button ref={newAreaAdminTriggerRef} type="button" className="admin-btn admin-btn-primary admin-new-area-admin" onClick={openCreateAdminForm}>
              {t('+ New Area Admin')}
            </button>
          </div>
          {adminFormMessage && <div className="admin-success-banner" role="status">{adminFormMessage}</div>}
          {adminNotice && (
            <div className={`admin-success-banner${adminNoticeType === 'error' ? ' admin-error-banner' : ''}`} role={adminNoticeType === 'error' ? 'alert' : 'status'} aria-live="polite">
              <span>{adminNotice}</span>
              <button type="button" onClick={dismissAdminNotice} aria-label={t('Dismiss message')}>
                {t('Dismiss')}
              </button>
            </div>
          )}
          {adminFormOpen && createPortal(
            <div
              className="admin-modal-overlay"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !adminFormLoading) handleCancelAdminEdit();
              }}
            >
              <section
                ref={adminModalRef}
                className="admin-form-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="area-admin-modal-title"
                tabIndex={-1}
              >
                <div className="admin-modal-header">
                  <h2 id="area-admin-modal-title" className="admin-card-title">
                    {t(editingAdminId ? 'Edit Area Admin' : 'Create Area Admin Account')}
                  </h2>
                  <button type="button" className="admin-modal-close" aria-label={t('Close')} onClick={handleCancelAdminEdit} autoFocus>
                    ×
                  </button>
                </div>
                <form
                  id="area-admin-form"
                  onSubmit={handleAdminSubmit}
                  className="admin-area-admin-form admin-modal-body"
                  autoComplete="off"
                >
                  {!editingAdminId && (
                    <p className="admin-subtitle admin-create-admin-help">
                      {t('Create an Area Admin account for one assigned area.')}
                    </p>
                  )}
                  {adminFormError && <div className="admin-empty-text" role="alert">{adminFormError}</div>}
                  {areaError && <p className="admin-empty-text" role="alert">{areaError}</p>}
                  <input name="name" autoComplete="off" value={adminForm.name} onChange={handleAdminFormChange} placeholder={t('Full name')} required className="admin-card-detail" />
                  <input name="email" type="email" autoComplete="off" value={adminForm.email} onChange={handleAdminFormChange} placeholder={t('Email')} required className="admin-card-detail" />
                  {!editingAdminId && <input name="username" autoComplete="off" value={adminForm.username} onChange={handleAdminFormChange} placeholder={t('Username')} minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" required className="admin-card-detail" />}
                  <input name="phone" type="tel" autoComplete="off" value={adminForm.phone} onChange={handleAdminFormChange} placeholder="09XXXXXXXX or +2519XXXXXXXX" pattern="(?:\+2519[0-9]{8}|09[0-9]{8})" title="Use +2519XXXXXXXX or 09XXXXXXXX." className="admin-card-detail" />
                  {!editingAdminId && (
                    <div className="admin-password-field">
                      <input
                        id="area-admin-temporary-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        aria-label={t('Temporary password')}
                        autoComplete="off"
                        value={adminForm.password}
                        onChange={handleAdminFormChange}
                        placeholder={t('Temporary password')}
                        minLength="8"
                        required
                        className="admin-card-detail"
                      />
                      <button
                        type="button"
                        className="admin-password-toggle"
                        aria-label={showPassword ? t('Hide password') : t('Show password')}
                        title={showPassword ? t('Hide password') : t('Show password')}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
                      </button>
                    </div>
                  )}
                  <select name="area" autoComplete="off" value={adminForm.area} onChange={handleAdminFormChange} required className="admin-card-detail" aria-label={t('Select an assigned area')}>
                    <option value="" disabled>{areas.length ? t('Select an assigned area') : t('No places registered yet')}</option>
                    {areas.map((area) => {
                      const areaAdmin = getAreaAdminFor(area.name, editingAdminId);
                      return (
                        <option key={area._id} value={area.name} disabled={Boolean(areaAdmin)}>
                          {area.name}{areaAdmin ? ` ${t('(taken by {name})', { name: areaAdmin.name })}` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {areas.length === 0 && (
                    <p className="admin-card-detail">
                      {t('No places registered yet')}. <Link to="/admin-dashboard/places">{t('Ethiopia Places')}</Link>
                    </p>
                  )}
                  <div className="admin-card-detail admin-area-admin-type">{t('Admin Type')}: <strong>{t('Area Admin')}</strong></div>
                </form>
                <footer className="admin-form-modal-actions">
                  <button type="button" onClick={handleCancelAdminEdit} className="admin-btn" disabled={adminFormLoading}>{t('Cancel')}</button>
                  <button type="submit" form="area-admin-form" disabled={adminFormLoading} className="admin-btn admin-btn-primary">
                    {adminFormLoading ? t('Saving...') : editingAdminId ? t('Save Changes') : t('Create Admin')}
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )}
        </section>
      )}

      {type === 'paymentPeriod' && isPlatformAdmin && (
        <section className="admin-detail-section admin-dedicated-content admin-payment-period-panel">
          <h2 className="admin-card-title">Payment Period Overview</h2>
          {loading ? (
            <div className="admin-loading-small">Loading payment periods...</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">No payment period data found.</div>
          ) : (
            <div className="admin-grid">
              {items.map((payment) => (
                <div key={payment._id} className="admin-card">
                  <h4 className="admin-card-title"> {payment.paymentPeriod}</h4>
                  <p className="admin-card-detail">Tenant: {payment.tenant?.name || 'Unknown'}</p>
                  <p className="admin-card-detail">Property: {payment.property?.title || 'Unknown property'}</p>
                  <p className="admin-card-detail">Area: {payment.property?.city || payment.property?.region || 'Unknown area'}</p>
                  <p className="admin-card-detail">Amount: ETB {Number(payment.amount || 0).toLocaleString()}</p>
                  <p className="admin-card-detail"> {payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : 'Date unavailable'}</p>
                  <p className="admin-card-detail">Status: {payment.status || 'Unknown'}</p>
                  <p className="admin-card-detail">Reference: {payment.paymentReference || 'N/A'}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {type === 'demoBankAccounts' && isPlatformAdmin && (
        <section className="admin-detail-section admin-dedicated-content">
          <h2 className="admin-card-title">DEMO Bank Accounts</h2>
          <p className="admin-subtitle">
            Internal university-project accounts only. These are not real bank accounts.
          </p>
          {loading ? (
            <div className="admin-loading-small">Loading demo accounts...</div>
          ) : loadError ? (
            <div className="admin-empty-text">{loadError}</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">No demo bank accounts have been created.</div>
          ) : (
            <div className="admin-grid">
              {items.map((account) => (
                <div key={account._id} className="admin-card">
                  <h4 className="admin-card-title">DEMO · {account.landlord}</h4>
                  <p className="admin-card-detail">Bank: {account.bankName} ({account.bankCode})</p>
                  <p className="admin-card-detail">Demo Account Number: {account.accountNumber}</p>
                  <p className="admin-card-detail">Balance: {Number(account.balance || 0).toFixed(2)} ETB</p>
                  <p className="admin-card-detail">Status: {account.status}</p>
                  <p className="admin-card-detail">
                    Created: {account.createdAt ? new Date(account.createdAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isAdminManagementPage && isPlatformAdmin && (
        <section className="admin-detail-section admin-dedicated-content admin-management-panel">
          <p className="admin-management-help">
            To free an area, Demote the admin or Edit their area. Deactivate only blocks login and keeps the area reserved.
          </p>
          <div className="admin-list-controls">
            <label className="admin-search-control">
              <span>{t('Search Area Admins')}</span>
              <input
                type="search"
                value={adminSearch}
                onChange={(event) => {
                  setAdminSearch(event.target.value);
                  setAdminPage(1);
                }}
                placeholder={t('Search by name, email, phone, or area')}
              />
            </label>
            <label className="admin-status-filter">
              <span>{t('Status')}</span>
              <select
                value={adminStatusFilter}
                onChange={(event) => {
                  setAdminStatusFilter(event.target.value);
                  setAdminPage(1);
                }}
              >
                <option value="all">{t('All statuses')}</option>
                <option value="active">{t('Active')}</option>
                <option value="inactive">{t('Inactive')}</option>
              </select>
            </label>
            <p className="admin-result-count">
              {t('Area Admin results: {count}').replace('{count}', String(filteredAreaAdmins.length))}
            </p>
          </div>
          {loading ? (
            <div className="admin-loading-small" role="status">{t('Loading...')}</div>
          ) : loadError ? (
            <div className="admin-empty-text">{loadError}</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">{t('No Area Admins found.')}</div>
          ) : filteredAreaAdmins.length === 0 ? (
            <div className="admin-empty-text">{t('No Area Admins match your filters.')}</div>
          ) : (
            <>
              <div className="admin-area-admin-table-wrap">
                <table className="admin-area-admin-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('Name')}</th>
                      <th scope="col">{t('Email')}</th>
                      <th scope="col">{t('Phone')}</th>
                      <th scope="col">{t('Area')}</th>
                      <th scope="col">{t('Status')}</th>
                      <th scope="col">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAreaAdmins.map((admin) => {
                      const assignedArea = admin.assignedArea || getAdminAreaValue(admin.adminAreas) || 'Unassigned';
                      const active = admin.isActive !== false;
                      return (
                        <tr key={admin._id} className={`admin-area-admin-row${openAdminMenuId === admin._id ? ' has-open-menu' : ''}`}>
                          <td data-label={t('Name')} className="admin-area-admin-name">{admin.name}</td>
                          <td data-label={t('Email')}>{admin.email}</td>
                          <td data-label={t('Phone')}>{admin.phone || '—'}</td>
                          <td data-label={t('Area')}>{assignedArea}</td>
                          <td data-label={t('Status')}>
                            <span className={`admin-status-badge ${active ? 'is-active' : 'is-inactive'}`}>
                              {active ? t('Active') : t('Inactive')}
                            </span>
                          </td>
                          <td data-label={t('Actions')} className="admin-area-admin-actions-cell">
                            <div className="admin-area-admin-actions">
                              <button
                                type="button"
                                onClick={() => handleSetAdminActive(admin, !active)}
                                disabled={adminActionLoading === admin._id}
                                className={`admin-btn admin-admin-status-action${active ? '' : ' is-activate'}`}
                              >{adminActionLoading === admin._id ? t('Saving...') : active ? t('Deactivate') : t('Activate')}
                              </button>
                              <div className="admin-action-menu">
                                <button
                                  type="button"
                                  className="admin-action-menu-trigger"
                                  aria-label={t('More actions')}
                                  aria-haspopup="menu"
                                  aria-expanded={openAdminMenuId === admin._id}
                                  aria-controls={`area-admin-actions-${admin._id}`}
                                  ref={(element) => {
                                    if (element) adminMenuTriggerRefs.current[admin._id] = element;
                                  }}
                                  onClick={() => {
                                    if (openAdminMenuId === admin._id) closeAdminMenu();
                                    else {
                                      setAdminMenuPosition(null);
                                      setOpenAdminMenuId(admin._id);
                                    }
                                  }}
                                >
                                  <span aria-hidden="true">⋮</span>
                                </button>
                                {openAdminMenuId === admin._id && createPortal(
                                  <div
                                    ref={adminMenuPanelRef}
                                    id={`area-admin-actions-${admin._id}`}
                                    className="admin-action-menu-panel"
                                    role="menu"
                                    aria-label={t('Actions for {name}').replace('{name}', admin.name)}
                                    data-placement={adminMenuPosition?.placement || 'below'}
                                    style={{
                                      position: 'fixed',
                                      top: adminMenuPosition?.top ?? 0,
                                      left: adminMenuPosition?.left ?? 0,
                                      visibility: adminMenuPosition ? 'visible' : 'hidden',
                                    }}
                                    onKeyDown={(event) => {
                                      const menuItems = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'));
                                      const currentIndex = menuItems.indexOf(document.activeElement);
                                      let nextIndex;
                                      if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % menuItems.length;
                                      else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
                                      else if (event.key === 'Home') nextIndex = 0;
                                      else if (event.key === 'End') nextIndex = menuItems.length - 1;
                                      else if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        menuItems[currentIndex]?.click();
                                        return;
                                      }
                                      else if (event.key === 'Tab') {
                                        closeAdminMenu();
                                        return;
                                      } else return;
                                      event.preventDefault();
                                      menuItems[nextIndex]?.focus();
                                    }}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        closeAdminMenu(true);
                                        handleEditAdmin(admin);
                                      }}
                                    >
                                      <FaEdit aria-hidden="true" />
                                      <span>{t('Edit')}</span>
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        closeAdminMenu(true);
                                        setResetAdminId(admin._id);
                                        setResetTemporaryPassword('');
                                        setShowResetPassword(false);
                                        setAdminFormError('');
                                        setAdminFormMessage('');
                                      }}
                                    >
                                      <FaKey aria-hidden="true" />
                                      <span>{t('Reset password')}</span>
                                    </button>
                                    <hr className="admin-action-menu-divider" />
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="is-destructive"
                                      onClick={() => {
                                        closeAdminMenu(true);
                                        setDemotionAdmin(admin);
                                        setDemotionRole('');
                                      }}
                                      disabled={adminActionLoading === admin._id}
                                    >
                                      <FaArrowDown aria-hidden="true" />
                                      <span>{t('Demote')}</span>
                                    </button>
                                  </div>,
                                  document.body,
                                )}
                              </div>
                            </div>
                            {resetAdminId === admin._id && (
                              <div className="admin-password-field admin-reset-password-field">
                                <label htmlFor={`reset-admin-password-${admin._id}`}>{t('Temporary password')}</label>
                                <input
                                  id={`reset-admin-password-${admin._id}`}
                                  type={showResetPassword ? 'text' : 'password'}
                                  autoComplete="new-password"
                                  minLength={8}
                                  value={resetTemporaryPassword}
                                  onChange={(event) => setResetTemporaryPassword(event.target.value)}
                                  className="admin-card-detail"
                                  required
                                />
                                <button
                                  type="button"
                                  className="admin-password-toggle"
                                  aria-label={showResetPassword ? t('Hide password') : t('Show password')}
                                  title={showResetPassword ? t('Hide password') : t('Show password')}
                                  onClick={() => setShowResetPassword((current) => !current)}
                                >
                                  {showResetPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
                                </button>
                                <div className="admin-reset-password-actions">
                                  <button type="button" className="admin-btn" onClick={() => {
                                    setResetAdminId(null);
                                    setResetTemporaryPassword('');
                                    setShowResetPassword(false);
                                  }}>{t('Cancel')}</button>
                                  <button
                                    type="button"
                                    className="admin-btn admin-btn-primary"
                                    disabled={resetTemporaryPassword.length < 8 || adminActionLoading === admin._id}
                                    onClick={() => handleResetAdminPassword(admin)}
                                  >
                                    {adminActionLoading === admin._id ? t('Saving...') : t('Reset password')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <nav className="admin-pagination" aria-label={t('Area Admin pagination')}>
                <button type="button" className="admin-btn" disabled={adminPage <= 1} onClick={() => setAdminPage((page) => Math.max(1, page - 1))}>
                  {t('Previous')}
                </button>
                <span>{t('Page {current} of {total}').replace('{current}', String(adminPage)).replace('{total}', String(adminPageCount))}</span>
                <button type="button" className="admin-btn" disabled={adminPage >= adminPageCount} onClick={() => setAdminPage((page) => Math.min(adminPageCount, page + 1))}>
                  {t('Next')}
                </button>
              </nav>
            </>
          )}
        </section>
      )}

      {type === 'rentalRequests' && (
        <section className={`admin-detail-section admin-dedicated-content${isUserListPage ? ' admin-user-list-panel' : ''}`}>
          {loading ? (
            <div className="admin-loading-small">Loading rental requests...</div>
          ) : loadError ? (
            <div className="admin-empty-text">{loadError}</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">No rental requests found.</div>
          ) : (
            <div className="admin-grid">
              {items.map((request) => (
                <div key={request._id} className="admin-card">
                  <h4 className="admin-card-title"> {request.property?.title || 'Property'}</h4>
                  <p className="admin-card-detail">Tenant: {request.tenant?.name || request.tenantName || 'Unknown tenant'}</p>
                  <p className="admin-card-detail">Area: {request.property?.city || request.property?.region || 'Unknown area'}</p>
                  <p className="admin-card-detail">Status: {request.status || 'pending'}</p>
                  {request.property?._id && (
                    <button
                      type="button"
                      className="admin-card-link"
                      onClick={() =>openRentalRequestDetails(request)}
                    >View Details
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {type === 'rentalRequests' && selectedRentalRequest && (
        <div className="admin-request-modal-overlay" role="presentation" onClick={() =>setSelectedRentalRequest(null)}>
          <section
            className="admin-request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rental-request-details-title"
            onClick={(event) =>event.stopPropagation()}
          >
            <div className="admin-request-modal-header">
              <h2 id="rental-request-details-title" className="admin-card-title">Rental Request Details</h2>
              <button type="button" className="admin-card-link" onClick={() =>setSelectedRentalRequest(null)}>← Back to Previous</button>
            </div>
            <PropertyImage
              src={getPropertyImages(selectedRentalRequest.property)}
              alt={selectedRentalRequest.property?.title || 'Property'}
              className="admin-request-modal-image"
              fallbackClassName="admin-request-modal-image admin-empty-text"
              fallback="No property image available"
            />
            <h3 className="admin-card-title"> {selectedRentalRequest.property?.title || 'Property'}</h3>
            <p className="admin-card-detail">Tenant: {selectedRentalRequest.tenant?.name || selectedRentalRequest.tenantName || 'Unknown tenant'}</p>
            <p className="admin-card-detail">Landlord: {selectedRentalRequest.landlord?.name || 'Unknown landlord'}</p>
            <p className="admin-card-detail">Area: {selectedRentalRequest.property?.city || selectedRentalRequest.property?.region || 'Unknown area'}</p>
            <p className="admin-card-detail">Address: {selectedRentalRequest.property?.location || 'Location unavailable'}</p>
            <p className="admin-card-detail">Request: {selectedRentalRequest.message || 'No message provided'}</p>
            <p className="admin-card-detail">Requested: {selectedRentalRequest.createdAt ? new Date(selectedRentalRequest.createdAt).toLocaleString() : 'Date unavailable'}</p>
            <p className="admin-card-detail">Status: {selectedRentalRequest.status || 'pending'}</p>
            <section className="admin-history-section" aria-labelledby="rental-request-history-title">
              <h3 id="rental-request-history-title" className="admin-card-title">{t('History')}</h3>
              {selectedRentalRequest.history?.length ? (
                <ol className="admin-history-timeline">
                  {[...selectedRentalRequest.history].sort((left, right) => new Date(right.at) - new Date(left.at)).map((entry, index) => (
                    <li key={`${entry.byId || entry.byName}-${entry.at}-${index}`} className="admin-history-entry">
                      <strong>{t(entry.action === 'verified' ? 'Verified' : entry.action === 'returned' ? 'Returned' : 'Rejected')}</strong>
                      <span>
                        {t('Handled by')}: {entry.byName || t('Unknown')}
                        {entry.isFormerAdmin ? ` ${t('(former admin)')}` : ''}
                      </span>
                      <span>{entry.at ? new Date(entry.at).toLocaleString() : t('Date unavailable')}</span>
                      {entry.note && <span>{t('Note')}: {entry.note}</span>}
                    </li>
                  ))}
                </ol>
              ) : <p className="admin-card-detail">{t('No history recorded yet.')}</p>}
            </section>
            <PropertyOwnershipProof
              propertyId={selectedRentalRequest.property?._id}
              hasProof={selectedRentalRequest.property?.hasVerificationDocument}
              title={selectedRentalRequest.property?.title}
              className="admin-card-detail"
              imageClassName="admin-card-image"
              fallbackClassName="admin-empty-text"
            />
            {rentalRequestFeedback && <p className="admin-request-feedback">{rentalRequestFeedback}</p>}
            {canManageRentalRequests && (
              <div className="admin-card-actions">
                <button
                  type="button"
                  onClick={() =>handleRentalRequestAction(selectedRentalRequest._id, 'approved')}
                  disabled={actionLoading === selectedRentalRequest._id}
                  className="admin-btn admin-btn-approve"
                >
                  {actionLoading === selectedRentalRequest._id ? 'Working...' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() =>handleRentalRequestAction(selectedRentalRequest._id, 'rejected')}
                  disabled={actionLoading === selectedRentalRequest._id}
                  className="admin-btn admin-btn-reject"
                >
                  {actionLoading === selectedRentalRequest._id ? 'Working...' : 'Reject'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {isUserListPage && (
        <section className="admin-detail-section admin-dedicated-content admin-user-list-panel">
          {userActionFeedback && (
            <p
              className={`admin-user-action-feedback admin-user-action-feedback-${userActionFeedback.type}`}
              role={userActionFeedback.type === 'error' ? 'alert' : 'status'}
            >
              {userActionFeedback.message}
            </p>
          )}
          <div className="admin-user-summary" aria-label={t('User role summary')}>
            {[
              ['all', 'Total users'],
              ['landlord', 'Landlords'],
              ['tenant', 'Tenants'],
              ['area_admin', 'Area Admins'],
              ['platform_admin', 'Platform Admins'],
            ].map(([role, label]) => (
              <button
                type="button"
                className={`admin-user-summary-card${userRoleTab === role ? ' is-selected' : ''}`}
                key={role}
                onClick={() => {
                  setUserRoleTab(role);
                  setUserPage(1);
                }}
                aria-pressed={userRoleTab === role}
              >
                <span>{t(label)}</span>
                <strong>{userRoleCounts[role]}</strong>
              </button>
            ))}
          </div>
          <div className="admin-user-controls">
            <div className="admin-user-role-tabs" role="tablist" aria-label={t('Filter users by role')}>
              {[
                ['all', 'All'],
                ['landlord', 'Landlords'],
                ['tenant', 'Tenants'],
                ['area_admin', 'Area Admins'],
                ['platform_admin', 'Platform Admins'],
              ].map(([role, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={userRoleTab === role}
                  key={role}
                  onClick={() => {
                    setUserRoleTab(role);
                    setUserPage(1);
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <div className="admin-user-search-controls">
              <input
                type="search"
                aria-label={t('Search users')}
                placeholder={t('Search by name, email, or phone')}
                value={userSearch}
                onChange={(event) => {
                  setUserSearch(event.target.value);
                  setUserPage(1);
                }}
              />
              <label>
                <span>{t('Status')}</span>
                <select
                  aria-label={t('Filter users by status')}
                  value={userStatusFilter}
                  onChange={(event) => {
                    setUserStatusFilter(event.target.value);
                    setUserPage(1);
                  }}
                >
                  <option value="all">{t('All statuses')}</option>
                  <option value="active">{t('Active')}</option>
                  <option value="inactive">{t('Inactive')}</option>
                </select>
              </label>
              <p className="admin-result-count" role="status">
                {t('User results: {count}').replace('{count}', String(filteredUsers.length))}
              </p>
            </div>
          </div>
          {loading ? (
            <div className="admin-loading-small" role="status">{t('Loading users...')}</div>
          ) : loadError ? (
            <div className="admin-empty-text" role="alert">{loadError}</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">{t('No users found.')}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="admin-empty-text">{t('No users match your filters.')}</div>
          ) : (
            <>
              <div className="admin-area-admin-table-wrap admin-user-table-wrap">
                <table className="admin-area-admin-table admin-user-table">
                  <thead>
                    <tr>
                      <th>{t('User')}</th>
                      <th>{t('Role')}</th>
                      <th>{t('Phone')}</th>
                      <th>{t('Status')}</th>
                      <th>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((user) => {
                      const userMenuKey = `user-${user._id}`;
                      const isCurrentUser = String(user._id) === String(currentUser?._id || currentUser?.id);
                      const isPlatformAdminAccount = user.displayRole === 'platform_admin';
                      const canChangeUserStatus = !isCurrentUser
                        && !isPlatformAdminAccount
                        && (isPlatformAdmin || ['tenant', 'landlord'].includes(user.role));
                      const canPromote = isPlatformAdmin
                        && !isCurrentUser
                        && ['tenant', 'landlord'].includes(user.role);
                      const canManageAreaAdmin = isPlatformAdmin
                        && !isCurrentUser
                        && user.displayRole === 'area_admin';
                      const hasMenuActions = canPromote || canManageAreaAdmin;
                      const areaName = user.assignedArea || getAdminAreaValue(user.adminAreas);

                      return (
                        <tr
                          key={user._id}
                          className={`admin-area-admin-row${openAdminMenuId === userMenuKey ? ' has-open-menu' : ''}`}
                        >
                          <td data-label={t('User')} className="admin-user-name-cell">
                            <div className="admin-user-identity">
                              <span className="admin-user-avatar" aria-hidden="true">
                                {(user.name || '?').trim().charAt(0).toLocaleUpperCase()}
                              </span>
                              <span className="admin-user-identity-text">
                                <span className="admin-area-admin-name">
                                  {user.name} {isCurrentUser && <span className="admin-user-you">{t('(you)')}</span>}
                                </span>
                                <span className="admin-user-email">{user.email}</span>
                                {user.displayRole === 'area_admin' && areaName && (
                                  <span className="admin-user-area">{t('Area')}: {areaName}</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td data-label={t('Role')}>
                            <span className={`admin-user-role-badge role-${user.displayRole}`}>
                              {t(user.displayRole === 'area_admin' ? 'Area Admin'
                                : user.displayRole === 'platform_admin' ? 'Platform Admin'
                                  : user.displayRole === 'landlord' ? 'Landlord' : 'Tenant')}
                            </span>
                          </td>
                          <td data-label={t('Phone')}>{user.phone || t('No phone provided')}</td>
                          <td data-label={t('Status')}>
                            <span className={`admin-status-badge ${user.isActive === false ? 'is-inactive' : 'is-active'}`}>
                              {t(user.isActive === false ? 'Inactive' : 'Active')}
                            </span>
                          </td>
                          <td data-label={t('Actions')} className="admin-area-admin-actions-cell">
                            {(canChangeUserStatus || hasMenuActions) && (
                              <div className="admin-area-admin-actions">
                                {canChangeUserStatus && (
                                  <button
                                    type="button"
                                    className="admin-btn admin-btn-primary admin-user-status-action"
                                    onClick={() => handleUserActiveChange(user)}
                                    disabled={adminActionLoading === user._id}
                                  >
                                    {t(user.isActive === false ? 'Activate' : 'Deactivate')}
                                  </button>
                                )}
                                {hasMenuActions && (
                                  <div className="admin-action-menu">
                                    <button
                                      ref={(element) => {
                                        adminMenuTriggerRefs.current[userMenuKey] = element;
                                      }}
                                      type="button"
                                      className="admin-action-menu-trigger"
                                      aria-label={t('More actions')}
                                      aria-haspopup="menu"
                                      aria-expanded={openAdminMenuId === userMenuKey}
                                      onClick={() => {
                                        if (openAdminMenuId === userMenuKey) closeAdminMenu();
                                        else {
                                          setAdminMenuPosition(null);
                                          setOpenAdminMenuId(userMenuKey);
                                        }
                                      }}
                                    >
                                      <span aria-hidden="true">⋮</span>
                                    </button>
                                    {openAdminMenuId === userMenuKey && createPortal(
                                      <div
                                        ref={adminMenuPanelRef}
                                        className="admin-action-menu-panel"
                                        role="menu"
                                        aria-label={t('Actions for {name}').replace('{name}', user.name || '')}
                                        data-placement={adminMenuPosition?.placement || 'below'}
                                        style={{
                                          position: 'fixed',
                                          top: adminMenuPosition?.top ?? 0,
                                          left: adminMenuPosition?.left ?? 0,
                                          visibility: adminMenuPosition ? 'visible' : 'hidden',
                                        }}
                                        onKeyDown={(event) => {
                                          const menuItems = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'));
                                          const currentIndex = menuItems.indexOf(document.activeElement);
                                          let nextIndex;
                                          if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % menuItems.length;
                                          else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
                                          else if (event.key === 'Home') nextIndex = 0;
                                          else if (event.key === 'End') nextIndex = menuItems.length - 1;
                                          else if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            menuItems[currentIndex]?.click();
                                            return;
                                          } else if (event.key === 'Tab') {
                                            closeAdminMenu(false);
                                            return;
                                          } else return;
                                          event.preventDefault();
                                          menuItems[nextIndex]?.focus();
                                        }}
                                      >
                                        {canPromote && (
                                          <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                              closeAdminMenu(false);
                                              setPromotionUser(user);
                                              setPromotionArea('');
                                            }}
                                          >
                                            <span>{t('Promote to Area Admin')}</span>
                                          </button>
                                        )}
                                        {canManageAreaAdmin && (
                                          <Link
                                            role="menuitem"
                                            to="/admin-dashboard/admin-management"
                                            onClick={() => closeAdminMenu(false)}
                                          >
                                            {t('Manage in Admin Management')}
                                          </Link>
                                        )}
                                      </div>,
                                      document.body,
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <nav className="admin-pagination" aria-label={t('User pagination')}>
                <button type="button" className="admin-btn" disabled={userPage <= 1} onClick={() => setUserPage((page) => Math.max(1, page - 1))}>
                  {t('Previous')}
                </button>
                <span>{t('Page {current} of {total}').replace('{current}', String(userPage)).replace('{total}', String(userPageCount))}</span>
                <button type="button" className="admin-btn" disabled={userPage >= userPageCount} onClick={() => setUserPage((page) => Math.min(userPageCount, page + 1))}>
                  {t('Next')}
                </button>
              </nav>
            </>
          )}
        </section>
      )}

      {type !== 'paymentPeriod' && !isAdminManagementPage && !isUserListPage && type !== 'rentalRequests' && (
        <section className={`admin-detail-section admin-dedicated-content${type === 'allProperties' && isPlatformAdmin ? ' admin-platform-properties-panel' : ''}`}>
          {loading ? (
            <div className="admin-loading-small">Loading...</div>
          ) : loadError ? (
            <div className="admin-empty-text">{loadError}</div>
          ) : items.length === 0 ? (
            <div className="admin-empty-text">No records found.</div>
          ) : (
            <div className="admin-grid">
              {items.map(property => (
                <div key={property._id} className="admin-card">
                  <PropertyImage
                    src={getPropertyImages(property)}
                    alt={property.title}
                    className="admin-card-image"
                    fallbackClassName="admin-card-image admin-empty-text"
                    fallbackText="No property image available"
                  />
                  <h4 className="admin-card-title">{property.title}</h4>
                  <p className="admin-card-detail"> {property.location}</p>
                  <p className="admin-card-price">ETB {Number(property.price).toLocaleString()}</p>
                  <p className="admin-card-detail">Bedrooms: {property.bedrooms}</p>
                  <p className="admin-card-detail">Landlord: {property.landlord?.name || 'Unknown Owner'}</p>
                  <p className="admin-card-detail"> {property.description || 'No description provided'}</p>
                  <p className="admin-card-detail">Submitted: {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : 'Date unavailable'}</p>
                  <p className="admin-card-detail">Status: {displayVerificationStatus(property)}
                  </p>
                  {['verified', 'rejected', 'returned'].includes(property.decision) && (
                    property.handledByName && property.handledByName !== 'Unknown (before history tracking)'
                      ? (
                        <p className="admin-card-detail">
                          {t(`${property.decision === 'verified' ? 'Verified' : property.decision === 'rejected' ? 'Rejected' : 'Returned'} by {name} on {date}`, {
                            name: property.handledByName,
                            date: property.handledAt ? formatDate(property.handledAt, { dateStyle: 'medium' }) : t('Date unavailable'),
                          })}
                          {property.handledByIsFormerAdmin ? ` ${t('(former admin)')}` : ''}
                        </p>
                      )
                      : <p className="admin-card-detail">{t('Handled before history tracking')}</p>
                  )}
                  {!property.decision && ['approved', 'rejected'].includes(property.verificationStatus) && (
                    <p className="admin-card-detail">{t('Handled before history tracking')}</p>
                  )}
                  <PropertyOwnershipProof
                    propertyId={property._id}
                    hasProof={property.hasVerificationDocument}
                    title={property.title}
                    className="admin-card-detail"
                    imageClassName="admin-card-image"
                    fallbackClassName="admin-empty-text"
                  />
                  {canManageVerification && (
                    <div className="admin-card-actions">
                      <button
                        type="button"
                        onClick={() =>handlePropertyAction(property._id, 'verify')}
                        disabled={actionLoading === property._id}
                        className="admin-btn admin-btn-approve"
                      >
                        {actionLoading === property._id ? 'Working...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>handlePropertyAction(property._id, 'reject')}
                        disabled={actionLoading === property._id}
                        className="admin-btn admin-btn-reject"
                      >
                        {actionLoading === property._id ? 'Working...' : 'Reject'}
                      </button>
                    </div>
                  )}
                  {type !== 'awaitingVerification' && property._id && (
                    <Link
                      to={`/property/${property._id}`}
                      state={{
                        from: `${location.pathname}${location.search}`,
                        fromState: location.state,
                      }}
                      className="admin-card-link"
                    >View details</Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {demotionAdmin && (
        <div className="admin-request-modal-overlay" role="presentation">
          <section
            className="admin-request-modal admin-role-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="area-admin-demotion-title"
          >
            <h2 id="area-admin-demotion-title" className="admin-card-title">
              {t('Change Area Admin role')}
            </h2>
            <p className="admin-card-detail">{getAreaHandoverConfirmation(demotionAdmin)}</p>
            <fieldset className="admin-role-options">
              <legend>{t('Choose what happens to {name}.').replace('{name}', demotionAdmin.name)}</legend>
              {[
                ['landlord', t('Landlord')],
                ['tenant', t('Tenant')],
                ['deactivate', t('Deactivate only (no role)')],
              ].map(([value, label]) => (
                <label key={value} className="admin-role-option">
                  <input
                    type="radio"
                    name="area-admin-demotion-role"
                    value={value}
                    required
                    checked={demotionRole === value}
                    onChange={() => setDemotionRole(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  setDemotionAdmin(null);
                  setDemotionRole('');
                }}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={!demotionRole || adminActionLoading === demotionAdmin._id}
                onClick={handleDemoteAdmin}
              >
                {adminActionLoading === demotionAdmin._id ? t('Saving...') : t('Confirm role change')}
              </button>
            </div>
          </section>
        </div>
      )}

      {promotionUser && (
        <div className="admin-request-modal-overlay" role="presentation">
          <section
            className="admin-request-modal admin-role-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="area-admin-promotion-title"
          >
            <h2 id="area-admin-promotion-title" className="admin-card-title">
              {t('Promote to Area Admin')}
            </h2>
            <p className="admin-card-detail">
              {t('Select an area for {name}.').replace('{name}', promotionUser.name)}
            </p>
            <label className="admin-role-area-label" htmlFor="promote-admin-area">
              {t('Assigned area')}
            </label>
            <select
              id="promote-admin-area"
              value={promotionArea}
              onChange={(event) => setPromotionArea(event.target.value)}
              required
              className="admin-card-detail"
            >
              <option value="" disabled>{t('Select an assigned area')}</option>
              {areas.map((area) => {
                const areaAdmin = getAreaAdminFor(area.name);
                return (
                  <option key={area._id} value={area.name} disabled={Boolean(areaAdmin)}>
                    {area.name}{areaAdmin ? ` ${t('(taken by {name})', { name: areaAdmin.name })}` : ''}
                  </option>
                );
              })}
            </select>
            {areaError && <p className="admin-empty-text" role="alert">{areaError}</p>}
            {areas.length === 0 && !areaError && (
              <p className="admin-empty-text">{t('No places registered yet')}</p>
            )}
            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  setPromotionUser(null);
                  setPromotionArea('');
                }}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={!promotionArea || adminActionLoading === promotionUser._id}
                onClick={handlePromoteUser}
              >
                {adminActionLoading === promotionUser._id ? t('Saving...') : t('Confirm promotion')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminSectionPage;
