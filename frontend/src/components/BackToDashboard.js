import React from 'react';
import { Link } from 'react-router-dom';
import './backToDashboard.css';

const BackToDashboard = ({ dashboardRoute = '/tenant-dashboard' }) => (
  <Link to={dashboardRoute} className="back-to-dashboard">
    ← Back to Dashboard
  </Link>
);

export default BackToDashboard;
