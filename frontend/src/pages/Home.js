import React from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaShieldAlt, FaSearch } from 'react-icons/fa';
import './home.css';

const Home = () => (
  <div className="public-page home-page">
    <div className="home-container">
      <section className="home-hero" aria-label="Featured home overview">
        <p className="home-eyebrow">A better way to find your next home</p>
        <h1 className="home-title">House Rental</h1>
        <p className="home-subtitle">
          Find and rent verified properties with confidence.
        </p>
        <div className="home-buttons">
          <Link to="/search" className="home-btn home-btn-primary">Find Properties</Link>
          <Link to="/about" className="home-btn home-btn-primary">Learn More</Link>
        </div>
      </section>

      <section className="home-features" aria-label="Why choose RentalVerify">
        <article className="home-feature-card">
          <div className="home-feature-icon" aria-hidden="true"><FaCheck /></div>
          <h2 className="home-feature-title">Verified Properties</h2>
          <p className="home-feature-desc">
            Browse rental properties reviewed and approved by administrators.
          </p>
        </article>

        <article className="home-feature-card">
          <div className="home-feature-icon" aria-hidden="true"><FaShieldAlt /></div>
          <h2 className="home-feature-title">Secure and Trusted</h2>
          <p className="home-feature-desc">
            Your personal information and property documents are handled securely.
          </p>
        </article>

        <article className="home-feature-card">
          <div className="home-feature-icon" aria-hidden="true"><FaSearch /></div>
          <h2 className="home-feature-title">Easy Property Search</h2>
          <p className="home-feature-desc">
            Find suitable rental homes by location, price, and number of bedrooms.
          </p>
        </article>
      </section>
      <div className="home-image-credit" aria-hidden="true">Find a place to call home
      </div>
    </div>
  </div>
);

export default Home;
