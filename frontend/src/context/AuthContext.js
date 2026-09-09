import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const setAuthHeader = (jwtToken) => {
  if (jwtToken) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${jwtToken}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
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
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const persistUser = (userData) => {
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('user');
    }
  };

  const loadUser = useCallback(async (currentToken = token) => {
    if (!currentToken) {
      setUser(null);
      persistUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await axios.get('http://localhost:5000/api/auth/me');
      const authUser = res.data.user || res.data;
      setUser(authUser);
      persistUser(authUser);
    } catch (error) {
      localStorage.removeItem('token');
      persistUser(null);
      setToken(null);
      setAuthHeader(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setAuthHeader(token);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    loadUser(token);
  }, [token, loadUser]);

  const login = async (email, password) => {
    try {
      const res = await axios.post('http://localhost:5000/api/auth/login', {
        email,
        password,
      });

      const jwtToken = res.data.token;
      const authUser = res.data.user;
      localStorage.setItem('token', jwtToken);
      persistUser(authUser);
      setAuthHeader(jwtToken);
      setToken(jwtToken);
      setUser(authUser);

      return { success: true, user: authUser };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const register = async (userData) => {
    try {
      const res = await axios.post('http://localhost:5000/api/auth/register', userData);
      const jwtToken = res.data.token;
      const authUser = res.data.user;

      if (jwtToken) {
        localStorage.setItem('token', jwtToken);
        persistUser(authUser);
        setAuthHeader(jwtToken);
        setToken(jwtToken);
        setUser(authUser);
      }

      return { success: true, user: authUser };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    persistUser(null);
    setToken(null);
    setUser(null);
    setAuthHeader(null);
  };

  const value = {
    user,
    loading,
    token,
    login,
    register,
    logout,
    loadUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};