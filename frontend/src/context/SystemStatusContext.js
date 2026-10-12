import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { apiUrl } from '../utils/apiUrl';

const defaultStatus = {
  maintenance: {
    enabled: false,
    message: 'RentalVerify is temporarily unavailable for scheduled maintenance. Please check back soon.',
  },
  branding: {
    websiteName: 'House Rental Management System',
    websiteLogoDataUri: '',
    contactEmail: '',
    contactPhone: '',
    contactAddress: '',
  },
};

const SystemStatusContext = createContext(null);

export const SystemStatusProvider = ({ children }) => {
  const [status, setStatus] = useState(defaultStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshStatus = useCallback(async () => {
    try {
      const response = await axios.get(apiUrl('/api/system/status'));
      if (!response.data?.maintenance || !response.data?.branding) {
        throw new Error('Invalid public system status response.');
      }
      setStatus(response.data);
      setError('');
      return response.data;
    } catch (requestError) {
      console.error('Unable to load public system status:', requestError);
      setError('System status is unavailable. Refresh the page or try again shortly.');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus().catch(() => {});
  }, [refreshStatus]);

  const value = { status, loading, error, refreshStatus };
  return (
    <SystemStatusContext.Provider value={value}>
      {children}
    </SystemStatusContext.Provider>
  );
};

export const useSystemStatus = () => {
  const context = useContext(SystemStatusContext);
  if (!context) throw new Error('useSystemStatus must be used within SystemStatusProvider.');
  return context;
};

export const useOptionalSystemStatus = () => useContext(SystemStatusContext);
