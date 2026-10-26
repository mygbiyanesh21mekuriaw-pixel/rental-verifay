import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const getEffectiveRole = (user) => {
  if (!user || user.role !== 'admin') return user?.role;
  return user.adminType === 'area' ||
    (!user.adminType && (user.adminAreas || []).length > 0)
    ? 'area_admin'
    : 'platform_admin';
};

const ALWAYS_ON_PERMISSIONS = ['dashboard', 'accountSettings', 'changePassword'];

const isPlatformAdmin = (user) => (
  user?.effectiveRole === 'platform_admin' ||
  user?.role === 'platform_admin' ||
  (user?.role === 'admin' && (
    user.adminType === 'platform' ||
    (!user.adminType && (user.adminAreas || []).length === 0)
  ))
);

const fetchAuthenticatedUser = async () => {
  const userResponse = await axios.get(process.env.REACT_APP_API_URL + '/api/auth/me');
  const user = userResponse.data.user || userResponse.data;
  const effectiveRole = getEffectiveRole(user);
  return { ...user, ...(effectiveRole ? { effectiveRole } : {}) };
};

const normalizeLoginEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return normalizedEmail.replace(/@rentalverifay\.com$/i, '@rentalverify.com');
};

const setAuthHeader = (jwtToken) => {
  if (jwtToken) {
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + jwtToken;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
};

const persistToken = (jwtToken) => {
  if (jwtToken) {
    localStorage.setItem('token', jwtToken);
  } else {
    localStorage.removeItem('token');
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const persistUser = (userData) => {
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('user');
    }
  };

  const updateUser = (userData) => {
    setUser(userData);
    persistUser(userData);
  };

  const loadPermissions = useCallback(async (authUser) => {
    if (isPlatformAdmin(authUser)) {
      setPermissionError('');
      setPermissionLoading(false);
      return;
    }

    setPermissionLoading(true);
    try {
      const response = await axios.get(process.env.REACT_APP_API_URL + '/api/permissions/me');
      const permissions = response.data?.permissions;
      if (!Array.isArray(permissions) || permissions.length === 0) {
        throw new Error('The permissions response was empty or invalid.');
      }
      const enabledPermissions = Object.fromEntries(permissions.map((key) => [key, true]));
      ALWAYS_ON_PERMISSIONS.forEach((key) => { enabledPermissions[key] = true; });
      const updatedUser = { ...authUser, permissions: enabledPermissions };
      setUser(updatedUser);
      persistUser(updatedUser);
      setPermissionError('');
    } catch (error) {
      const fallbackPermissions = Object.fromEntries(ALWAYS_ON_PERMISSIONS.map((key) => [key, true]));
      const updatedUser = { ...authUser, permissions: fallbackPermissions };
      setUser(updatedUser);
      persistUser(updatedUser);
      setPermissionError('Unable to load permissions. Only dashboard and account features are available until permissions can be loaded.');
    } finally {
      setPermissionLoading(false);
    }
  }, []);

  const loadUser = useCallback(async (currentToken = token) => {
    if (!currentToken) {
      setUser(null);
      persistUser(null);
      setPermissionError('');
      setPermissionLoading(false);
      setLoading(false);
      return;
    }

    try {
      const authUser = await fetchAuthenticatedUser();
      setUser(authUser);
      persistUser(authUser);
      setLoading(false);
      await loadPermissions(authUser);
    } catch (error) {
      localStorage.removeItem('token');
      persistUser(null);
      setToken(null);
      setAuthHeader(null);
      setUser(null);
      setPermissionError('');
      setPermissionLoading(false);
    } finally {
      setLoading(false);
    }
  }, [loadPermissions, token]);

  useEffect(() => {
    setAuthHeader(token);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    loadUser(token);
  }, [token, loadUser]);

  useEffect(() => {
    const refreshPermissions = () => {
      if (localStorage.getItem('token')) loadUser();
    };
    window.addEventListener('focus', refreshPermissions);
    return () => window.removeEventListener('focus', refreshPermissions);
  }, [loadUser]);

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;

        if (status === 401) {
          persistToken(null);
          persistUser(null);
          setToken(null);
          setUser(null);
          setAuthHeader(null);
          if (window.location.pathname !== '/login') {
            window.location.assign('/login');
          }
        }

        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptorId);
  }, []);

  const login = async (identifier, password) => {
    try {
      const normalizedIdentifier = normalizeLoginEmail(identifier);
      const res = await axios.post(process.env.REACT_APP_API_URL + '/api/auth/login', {
        identifier: normalizedIdentifier,
        password,
      });

      const jwtToken = res.data.token;
      persistToken(jwtToken);
      setAuthHeader(jwtToken);
      const authUser = {
        ...res.data.user,
        ...(res.data.user?.role === 'admin' ? { effectiveRole: getEffectiveRole(res.data.user) } : {}),
      };
      persistUser(authUser);
      setToken(jwtToken);
      setUser(authUser);
      setPermissionError('');
      setPermissionLoading(!isPlatformAdmin(authUser));

      return { success: true, user: authUser };
    } catch (error) {
      const responseMessage = error.response?.data?.message;
      const developmentDetail = error.response?.data?.error;

      return {
        success: false,
        error: process.env.NODE_ENV === 'development' && developmentDetail
          ? (responseMessage || 'Login failed') + ': ' + developmentDetail
          : (responseMessage || 'Login failed'),
      };
    }
  };

  const register = async (userData) => {
    try {
      const res = await axios.post(process.env.REACT_APP_API_URL + '/api/auth/register', userData);
      return { success: true, user: res.data.user, message: res.data.message };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const logout = () => {
    persistToken(null);
    persistUser(null);
    setToken(null);
    setUser(null);
    setPermissionError('');
    setPermissionLoading(false);
    setAuthHeader(null);
  };

  const value = {
    user,
    loading,
    permissionLoading,
    permissionError,
    token,
    login,
    register,
    logout,
    loadUser,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};