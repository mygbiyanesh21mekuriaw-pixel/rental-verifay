import React from 'react';
import { Link } from 'react-router-dom';
import { FaBan } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const PermissionDeniedPage = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const dashboard = user?.role === 'admin'
    ? '/admin-dashboard'
    : user?.role === 'landlord'
      ? '/landlord-dashboard'
      : user?.role === 'tenant'
        ? '/tenant-dashboard'
        : '/';

  return (
    <main className="public-page auth-page">
      <section className="auth-card" role="alert">
        <FaBan aria-hidden="true" className="mb-4 text-2xl text-red-700" />
        <h1>{t('Permission denied')}</h1>
        <p className="auth-subtitle">{t('You do not have access to this feature.')}</p>
        <Link className="auth-submit inline-flex items-center justify-center no-underline" to={dashboard}>
          {t('Back to Dashboard')}
        </Link>
      </section>
    </main>
  );
};

export default PermissionDeniedPage;