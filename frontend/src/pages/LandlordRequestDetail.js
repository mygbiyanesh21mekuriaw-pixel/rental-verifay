import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaCalendarAlt,
  FaCommentDots,
  FaEnvelope,
  FaMapMarkerAlt,
  FaPhone,
  FaUser,
} from 'react-icons/fa';
import { useLanguage } from '../context/LanguageContext';

const normalizeStatus = (status) => (
  typeof status === 'string' && status.trim() ? status.trim().toLowerCase() : 'unknown'
);

const LandlordRequestDetail = () => {
  const { requestId } = useParams();
  const { t, formatDate, formatCurrency } = useLanguage();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(Boolean(requestId));
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!requestId) {
      setRequest(null);
      setError('Request not found.');
      setLoading(false);
      return () => { active = false; };
    }

    const loadRequest = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rent-requests/landlord-requests/${requestId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.data?._id) throw new Error('Request not found.');
        if (active) setRequest(response.data);
      } catch (requestError) {
        console.error('Unable to load landlord rental request details:', requestError);
        if (active) {
          setRequest(null);
          setError(requestError.response?.status === 404 ? 'Request not found.' : 'Unable to load request details.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRequest();
    return () => { active = false; };
  }, [requestId, retryCount]);

  const backLink = (
    <Link
      to="/landlord/rental-requests"
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 no-underline shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <FaArrowLeft aria-hidden="true" />
      {t('Back to Requests')}
    </Link>
  );

  if (loading) {
    return (
      <div className="w-full min-w-0 animate-pulse space-y-4" role="status" aria-label={t('Loading request details...')}>
        <div className="h-8 w-64 max-w-full rounded-lg bg-slate-200" />
        <div className="h-52 rounded-2xl bg-white shadow-sm" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-2xl font-bold text-slate-800">{t('Rental Request Details')}</h1>
          {backLink}
        </div>
        <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm" role="alert">
          <p className="mb-4 text-sm text-slate-700">{t(error || 'Request not found.')}</p>
          {error === 'Unable to load request details.' && (
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {t('Retry')}
            </button>
          )}
        </section>
      </div>
    );
  }

  const status = normalizeStatus(request.status);
  const statusLabel = status === 'unknown' ? 'N/A' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  const statusStyles = status === 'approved' || status === 'confirmed'
    ? 'border-green-200 bg-green-50 text-green-800'
    : status === 'rejected'
      ? 'border-red-200 bg-red-50 text-red-800'
      : status === 'pending'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-100 text-slate-700';
  const requestedDate = request.createdAt
    ? formatDate(request.createdAt, { dateStyle: 'medium', timeStyle: 'short' })
    : t('N/A');
  const tenantDetails = [
    { label: 'Tenant', value: request.tenant?.name || t('N/A'), Icon: FaUser },
    { label: 'Phone', value: request.tenant?.phone || t('N/A'), Icon: FaPhone },
    { label: 'Email', value: request.tenant?.email || t('N/A'), Icon: FaEnvelope },
    { label: 'Requested Date', value: requestedDate, Icon: FaCalendarAlt },
  ];

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-bold text-slate-800">{t('Rental Request Details')}</h1>
        {backLink}
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-blue-700">{t('Property')}</p>
            <h2 className="m-0 break-words text-xl font-bold text-slate-900 sm:text-2xl">
              {request.property?.title || t('N/A')}
            </h2>
            <p className="mb-0 mt-2 flex min-w-0 items-start gap-2 break-words text-sm text-slate-600">
              <FaMapMarkerAlt className="mt-1 shrink-0 text-blue-600" aria-hidden="true" />
              <span>{request.property?.location || t('N/A')}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:justify-end">
            {typeof request.property?.price === 'number' && (
              <div className="sm:text-right">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Rent')}</p>
                <p className="mb-0 mt-1 text-lg font-bold text-slate-900">{formatCurrency(request.property.price)}</p>
              </div>
            )}
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Status')}</span>
              <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-bold ${statusStyles}`}>
                {t(statusLabel)}
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          {tenantDetails.map(({ label, value, Icon }) => (
            <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Icon aria-hidden="true" />
              </div>
              <p className="m-0 text-sm font-semibold text-slate-500">{t(label)}</p>
              {label === 'Phone' && request.tenant?.phone ? (
                <a href={`tel:${request.tenant.phone}`} className="mt-1 block break-all text-sm font-semibold text-slate-800 underline-offset-4 hover:text-blue-700 hover:underline">
                  {value}
                </a>
              ) : label === 'Email' && request.tenant?.email ? (
                <a href={`mailto:${request.tenant.email}`} className="mt-1 block break-all text-sm font-semibold text-slate-800 underline-offset-4 hover:text-blue-700 hover:underline">
                  {value}
                </a>
              ) : (
                <p className="mb-0 mt-1 break-words text-sm font-semibold leading-6 text-slate-800">{value}</p>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 sm:px-6 sm:pb-6">
          <section className="min-w-0 rounded-xl border border-slate-200 p-4" aria-labelledby="tenant-request-message-title">
            <h3 id="tenant-request-message-title" className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
              <FaCommentDots className="text-blue-600" aria-hidden="true" />
              {t('Tenant Message')}
            </h3>
            <p className="mb-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
              {request.message || t('No message provided.')}
            </p>
          </section>
          {request.landlordComment && (
            <section className="min-w-0 rounded-xl border border-blue-100 bg-blue-50/50 p-4" aria-labelledby="landlord-request-comment-title">
              <h3 id="landlord-request-comment-title" className="mb-2 text-sm font-bold text-slate-700">{t('Landlord Comment')}</h3>
              <p className="mb-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{request.landlordComment}</p>
            </section>
          )}
        </div>
      </article>
    </div>
  );
};

export default LandlordRequestDetail;
