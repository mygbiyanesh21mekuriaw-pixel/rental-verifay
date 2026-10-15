import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const statusLabel = (status) => {
  if (status === 'approved' || status === 'confirmed') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'pending') return 'Pending';
  if (status === 'expired') return 'Expired';
  return status || 'N/A';
};

const TenantRentalRequestDetail = () => {
  const { requestId } = useParams();
  const { t, formatDate, formatCurrency } = useLanguage();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState(requestId ? '' : 'Rental request not found.');
  const [loading, setLoading] = useState(Boolean(requestId));

  useEffect(() => {
    if (!requestId) {
      setRequest(null);
      setError('Rental request not found.');
      setLoading(false);
      return undefined;
    }

    let active = true;
    const loadRequest = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rent-requests/my-requests/${requestId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.data?._id) {
          throw new Error('Rental request not found.');
        }
        if (active) setRequest(response.data);
      } catch (requestError) {
        if (active) {
          setRequest(null);
          console.error('Unable to load tenant rental request details:', requestError);
          setError(requestError.response?.status === 404
            ? 'Rental request not found.'
            : 'Unable to load rental request.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRequest();
    return () => {
      active = false;
    };
  }, [requestId]);

  if (loading) {
    return (
      <div className="w-full animate-pulse space-y-4" role="status" aria-label={t('Loading rental request details...')}>
        <div className="h-8 w-64 max-w-full rounded-lg bg-slate-200" />
        <div className="h-52 rounded-2xl bg-white shadow-sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-w-0 max-w-none space-y-4">
        <h1 className="mb-3 text-2xl font-bold text-slate-800">{t('Rental Request Details')}</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">
          <p className="mb-4 text-sm text-red-800">{t(error)}</p>
          <Link
            to="/tenant/rental-requests"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white no-underline transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            {t('Back to Rental Requests')}
          </Link>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="w-full min-w-0 max-w-none space-y-4">
        <h1 className="mb-3 text-2xl font-bold text-slate-800">{t('Rental Request Details')}</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
          <p className="mb-4 text-sm text-amber-900">{t('Rental request not found.')}</p>
          <Link
            to="/tenant/rental-requests"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white no-underline transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            {t('Back to Rental Requests')}
          </Link>
        </div>
      </div>
    );
  }

  const property = request.property || {};
  const landlord = request.landlord || {};
  const status = statusLabel(request.status);
  const adminResponse = request.adminComment?.trim();
  const decisionDate = request.reviewedAt;
  const statusStyles = status === 'Approved'
    ? 'border-green-200 bg-green-50 text-green-800'
    : status === 'Rejected'
      ? 'border-red-200 bg-red-50 text-red-800'
      : status === 'Pending'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-100 text-slate-700';
  const detailItems = [
    { label: 'Location', value: property.location || t('N/A') },
    { label: 'Landlord', value: landlord.name || t('N/A') },
    {
      label: 'Requested Date',
      value: request.createdAt
        ? formatDate(request.createdAt, { dateStyle: 'medium', timeStyle: 'short' })
        : t('N/A'),
    },
    ...(decisionDate
      ? [{
        label: 'Admin Decision Date',
        value: formatDate(decisionDate, { dateStyle: 'medium', timeStyle: 'short' }),
      }]
      : []),
  ];

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-bold text-slate-800">{t('Rental Request Details')}</h1>
        <Link
          to="/tenant/rental-requests"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 no-underline shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          {t('Back to Rental Requests')}
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-blue-700">{t('Property')}</p>
            <h2 className="m-0 break-words text-xl font-bold text-slate-900 sm:text-2xl">
              {property.title || request.propertyTitle || t('N/A')}
            </h2>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Request Status')}</span>
            <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-bold ${statusStyles}`}>
              {t(status)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2 lg:col-span-1">
            <p className="m-0 text-sm font-semibold text-slate-500">{t('Rent')}</p>
            <p className="mb-0 mt-2 break-words text-xl font-bold text-slate-900">
              {typeof property.price === 'number' ? formatCurrency(property.price) : t('N/A')}
            </p>
          </div>
          {detailItems.map(({ label, value }) => (
            <div key={label} className="min-w-0 rounded-xl border border-slate-200 p-4">
              <p className="m-0 text-sm font-semibold text-slate-500">{t(label)}</p>
              <p className="mb-0 mt-2 break-words text-sm font-semibold leading-6 text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        {adminResponse && (
          <div className="border-t border-slate-200 px-5 py-5 sm:px-6">
            <h3 className="m-0 text-sm font-bold text-slate-700">{t('Admin Response')}</h3>
            <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{adminResponse}</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default TenantRentalRequestDetail;
