import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './TenantDashboard.css';

const TenantDashboard = () => {
  const { user } = useAuth();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="tenant-container">
      <div className="tenant-header">
        <h1 className="tenant-title">👤 Tenant Dashboard</h1>
        <p className="tenant-subtitle">Welcome, {user?.name}!</p>
      </div>
    </div>
  );
};

export default TenantDashboard;
