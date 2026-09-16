import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './adminDashboard.css';

const AdminDashboard = () => {
  const { user } = useAuth();
  const adminLabel = user?.adminType === 'area' ? 'Area Admin' : 'Platform Admin';

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div className="admin-title-wrapper">
          <div>
            <h1 className="admin-title">
              <span className="admin-title-icon">⚙️</span>
              <span className="admin-title-gradient">Admin Dashboard</span>
            </h1>
            <p className="admin-subtitle">Welcome to the Admin Dashboard, <strong>{user?.name}</strong> ({adminLabel})!</p>
          </div>
        </div>
      </div>

      <div className="admin-overview-panel">
        <p className="admin-subtitle">Overview and summary information for the platform will appear here.</p>
      </div>
    </div>
  );
};

export default AdminDashboard;