import React from 'react';
import { Link } from 'react-router-dom';
import './backToDashboard.css';

const BackToDashboard = ({ dashboardRoute = '/tenant-dashboard', label = ' Back to Dashboard', className = '' }) => (
  <Link to={dashboardRoute} className={`back-to-dashboard ${className}`.trim()}>
    {label}
  </Link>
);

export default BackToDashboard;
