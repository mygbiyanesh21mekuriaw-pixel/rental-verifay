import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './home.css';

const Home = () => {
  const { user } = useAuth();

  return (
    <div className="home-container">
      {/* ===== የራስ ገፅ (Hero) ===== */}
      <div className="home-hero">
        <div className="home-logo-wrap" aria-label="MAU logo">
          <img
            src="/mekdela-amba-logo.jpeg"
            alt="Mekdela Amba University logo"
            className="home-logo-image"
          />
          <span className="home-logo-text">RentalVerify</span>
        </div>

        <h1 className="home-title">🏠 Rental Property Verification Portal</h1>
        <p className="home-subtitle">
          Find and rent verified properties with confidence
        </p>
        
        <div className="home-buttons">
          {user?.role === 'tenant' ? (
            <Link to="/search" className="home-btn home-btn-primary">
              🔍 Browse all properties
            </Link>
          ) : !user ? (
            <Link to="/login" className="home-btn home-btn-primary">
              🔐 Log in and find a home
            </Link>
          ) : null}
          {!user && (
            <Link to="/register" className="home-btn home-btn-secondary">
              📝 Register
            </Link>
          )}
        </div>
      </div>

      {/* ===== ባህሪያት (Features) ===== */}
      <div className="home-features">
        <div className="home-feature-card">
          <div className="home-feature-icon">✅</div>
          <h3 className="home-feature-title">Verified Properties</h3>
          <p className="home-feature-desc">
            Every property is verified by an administrator.
          </p>
        </div>
        
        <div className="home-feature-card">
          <div className="home-feature-icon">🔐</div>
          <h3 className="home-feature-title">Secure</h3>
          <p className="home-feature-desc">
            Your personal information is kept private.
          </p>
        </div>
        
        <div className="home-feature-card">
          <div className="home-feature-icon">⚡</div>
          <h3 className="home-feature-title">Fast and Easy</h3>
          <p className="home-feature-desc">
            Find your next home in just a few steps.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;