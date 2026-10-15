import React from 'react';
import './aboutUs.css';

const LegalPage = ({ title, sections }) => (
  <div className="public-page">
    <div className="public-content">
      <div className="about-container">
        <div className="about-hero">
          <h1 className="about-title">{title}</h1>
        </div>
        <div className="about-content">
          {sections.map(([heading, content]) => (
            <section className="about-section" key={heading}>
              <h2>{heading}</h2>
              <p>{content}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const PrivacyPolicy = () => (
  <LegalPage
    title="Privacy Policy"
    sections={[
      [
        'Information we collect',
        'We collect account details such as your name, email address, and phone number, along with property listing details, verification documents, and messages you choose to submit.',
      ],
      [
        'How information is used',
        'Information is used to operate your account, review listings and submitted documents, support rental requests, and help protect the platform from misuse.',
      ],
      [
        'Privacy and sharing',
        'Your information is available only as needed to provide platform services. We do not sell personal information; listing details you publish may be visible to other users.',
      ],
      [
        'Storage and retention',
        'We use reasonable safeguards for information handled by the platform and keep it only as long as needed for platform operations and applicable requirements.',
      ],
      [
        'Questions',
        'For questions about this policy or your information, contact the platform team at admin@gmail.com.',
      ],
    ]}
  />
);

export const TermsOfService = () => (
  <LegalPage
    title="Terms of Service"
    sections={[
      [
        'Using the platform',
        'Provide accurate account information, keep your login credentials secure, and use the platform only for lawful rental-related purposes.',
      ],
      [
        'Listings and verification',
        'Property information and supporting documents must be accurate and authorized. Listings may be reviewed, approved, or declined before they are publicly visible.',
      ],
      [
        'Fraud and prohibited activity',
        'Fake listings, impersonation, forged documents, misleading claims, and attempts to defraud other users are prohibited and may result in account restrictions.',
      ],
      [
        'Rental decisions',
        'Users are responsible for checking property details and agreeing on rental terms with one another. The platform helps connect users but does not replace their independent checks or agreements.',
      ],
      [
        'Questions',
        'For questions about these terms, contact the platform team at admin@gmail.com.',
      ],
    ]}
  />
);
