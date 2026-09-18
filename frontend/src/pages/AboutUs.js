import React from 'react';
import './aboutUs.css';

const About = () => {
  return (
    <div className="about-container">
      <div className="about-hero">
        <h1 className="about-title">ℹ️ About Us</h1>
        <p className="about-subtitle">
          House Rental Management System - secure and reliable
        </p>
      </div>

      <div className="about-content">
        <div className="about-section">
          <h2>🎯 Our Mission</h2>
          <p>
            Our mission is to reduce rental fraud and help tenants find verified properties easily.
          </p>
        </div>

        <div className="about-section">
          <h2>👁️ Our Vision</h2>
          <p>
            To be Ethiopia&apos;s most secure and trusted rental platform.
          </p>
        </div>

        <div className="about-section">
          <h2>✅ Why choose us?</h2>
          <div className="about-features">
            <div className="about-feature">
              <span className="about-feature-icon">✅</span>
              <div>
                <h4>Verified properties</h4>
                <p>Every property is verified by an administrator.</p>
              </div>
            </div>
            <div className="about-feature">
              <span className="about-feature-icon">🔐</span>
              <div>
                <h4>Secure</h4>
                <p>Your personal information is kept private.</p>
              </div>
            </div>
            <div className="about-feature">
              <span className="about-feature-icon">⚡</span>
              <div>
                <h4>Fast and easy</h4>
                <p>Find your next home in just a few steps.</p>
              </div>
            </div>
            <div className="about-feature">
              <span className="about-feature-icon">📞</span>
              <div>
                <h4>Direct contact</h4>
                <p>Connect directly with the landlord.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;