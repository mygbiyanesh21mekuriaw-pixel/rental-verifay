import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../context/LanguageContext';
import { useSystemStatus } from '../context/SystemStatusContext';
import { apiUrl } from '../utils/apiUrl';
import './contactUs.css';

const Contact = () => {
  const { status } = useSystemStatus();
  const { t } = useLanguage();
  const { websiteName, contactEmail, contactPhone, contactAddress } = status.branding;
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', area: '' });
  const [areas, setAreas] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submissionMessage, setSubmissionMessage] = useState('');

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => axios.get(apiUrl('/api/public/areas')))
      .then((response) => {
        if (active) setAreas(Array.isArray(response.data) ? response.data : []);
      })
      .catch((areaError) => {
        console.error('Unable to load contact form areas:', areaError);
        if (active) setError('Unable to load areas. Please refresh the page.');
      });
    return () => { active = false; };
  }, []);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    setSubmissionMessage('');
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError('');
    setSubmissionMessage('');
    try {
      const response = await axios.post(apiUrl('/api/contact'), form);
      setForm({ name: '', email: '', subject: '', message: '', area: '' });
      setSubmissionMessage(response.data?.message || 'Your message was saved in the Platform Admin contact inbox.');
    } catch (submitError) {
      console.error('Unable to submit contact message:', submitError);
      setError(submitError.response?.data?.message || 'Unable to send your message right now.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="public-page">
      <div className="public-content">
        <main className="contact-container">
          <header className="contact-hero">
            <h1 className="contact-title">Contact Us</h1>
            <p className="contact-subtitle">
              We welcome your questions and feedback about our student project.
            </p>
          </header>

          <div className="contact-content">
            <section className="contact-info-card !text-left sm:col-span-2" aria-labelledby="contact-message-title">
              <h2 id="contact-message-title" className="!mb-2 !text-left">{t('Send a message to the Platform Admin')}</h2>
              <p className="!mb-5 !text-left !text-sm">{t('Your message will be saved in the Platform Admin contact inbox.')}</p>
              <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submitMessage}>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  {t('Name')}
                  <input
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                    type="text"
                    name="name"
                    autoComplete="name"
                    maxLength={120}
                    value={form.name}
                    onChange={updateField}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  {t('Email')}
                  <input
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                    type="email"
                    name="email"
                    autoComplete="email"
                    maxLength={254}
                    value={form.email}
                    onChange={updateField}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                  {t('Area')}
                  <select
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                    name="area"
                    value={form.area}
                    onChange={updateField}
                    required
                  >
                    <option value="" disabled>{t('Select an area')}</option>
                    {areas.map((area) => <option key={area._id} value={area.name}>{area.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                  {t('Subject')}
                  <input
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                    type="text"
                    name="subject"
                    maxLength={180}
                    value={form.subject}
                    onChange={updateField}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                  {t('Message')}
                  <textarea
                    className="min-h-32 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                    name="message"
                    rows={5}
                    maxLength={5000}
                    placeholder={t('Write your message here...')}
                    value={form.message}
                    onChange={updateField}
                    required
                  />
                </label>
                {error && (
                  <p className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2" role="alert">
                    {t(error)}
                  </p>
                )}
                {submissionMessage && (
                  <p className="m-0 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 sm:col-span-2" role="status">
                    {t(submissionMessage)}
                  </p>
                )}
                <div className="sm:col-span-2">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-green-700 px-5 text-sm font-bold text-white transition hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                    type="submit"
                    disabled={sending}
                  >
                    {t(sending ? 'Sending...' : 'Send Message')}
                  </button>
                </div>
              </form>
            </section>

            <section className="contact-info-card" aria-labelledby="contact-location">
              <h2 id="contact-location">Location</h2>
              <p>{contactAddress || 'Mekdela Amba University (MAU), Ethiopia'}</p>
            </section>

            <section className="contact-info-card" aria-labelledby="contact-email">
              <h2 id="contact-email">Email</h2>
              <p><a href={`mailto:${contactEmail || 'admin@gmail.com'}`}>{contactEmail || 'admin@gmail.com'}</a></p>
            </section>

            {contactPhone && (
              <section className="contact-info-card" aria-labelledby="contact-phone">
                <h2 id="contact-phone">Phone</h2>
                <p><a href={`tel:${contactPhone}`}>{contactPhone}</a></p>
              </section>
            )}

            <section className="contact-info-card" aria-labelledby="contact-business-hours">
              <h2 id="contact-business-hours">Business Hours</h2>
              <p>Student Project — Online Support</p>
            </section>

            <section className="contact-info-card contact-project-card" aria-labelledby="contact-project">
              <h2 id="contact-project">Project Information</h2>
              <p>
                {websiteName} is an academic student project developed to demonstrate a rental
                property verification and management system.
              </p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Contact;
