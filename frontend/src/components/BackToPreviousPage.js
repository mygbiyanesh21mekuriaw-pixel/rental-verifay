import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './backToDashboard.css';

const fallbackRoute = '/landlord/my-properties';
const landlordPropertyRoutes = [
  '/landlord/my-properties',
  '/landlord/verified-properties',
  '/landlord/under-review',
  '/landlord/rejected',
  '/landlord/rented-properties',
];

const getSafePreviousRoute = (route) => (
  typeof route === 'string' &&
  landlordPropertyRoutes.some((path) => route === path || route.startsWith(`${path}?`))
    ? route
    : null
);

const BackToPreviousPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const previousRoute = getSafePreviousRoute(location.state?.from);
  const historyIndex = window.history.state?.idx;
  const hasPreviousInAppPage =
    Boolean(previousRoute) &&
    typeof historyIndex === 'number' &&
    historyIndex > 0;

  const handleClick = (event) => {
    if (!hasPreviousInAppPage) return;

    event.preventDefault();
    navigate(-1);
  };

  return (
    <Link
      to={previousRoute || fallbackRoute}
      className="back-to-previous-page"
      onClick={handleClick}
    >
      ← Back to Previous Page
    </Link>
  );
};

export default BackToPreviousPage;
