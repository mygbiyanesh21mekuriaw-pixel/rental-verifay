import React from 'react';
import { useSystemStatus } from '../context/SystemStatusContext';
import './contactUs.css';

const Contact = () => {
  const { status } = useSystemStatus();
  const { websiteName, contactEmail, contactPhone, contactAddress } = status.branding;

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
