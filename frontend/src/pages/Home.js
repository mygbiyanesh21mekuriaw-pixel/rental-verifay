import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './home.css';

const Home = () => {
  const { user } = useAuth();

  return (
    <div className="public-page home-page">
      <div className="home-container">
        <section className="home-hero" aria-label="Featured home overview">
          <div className="home-buttons home-buttons-hidden" aria-hidden="true">
            {user?.role === 'tenant' ? (
              <Link to="/search" className="home-btn home-btn-primary">Browse properties
              </Link>
            ) : !user ? (
              <>
                <Link to="/login" className="home-btn home-btn-primary">Log in and find a home
                </Link>
                <Link to="/register" className="home-btn home-btn-secondary">Register
                </Link>
              </>
            ) : null}
          </div>
        </section>

        <section className="home-features" aria-label="Why choose RentalVerify">
          <article className="home-feature-card">
            <div className="home-feature-icon" aria-hidden="true"></div>
            <h2 className="home-feature-title">Verified properties</h2>
            <p className="home-feature-desc">Every property is reviewed by an administrator.
            </p>
          </article>

          <article className="home-feature-card">
            <div className="home-feature-icon" aria-hidden="true"></div>
            <h2 className="home-feature-title">Secure and trusted</h2>
            <p className="home-feature-desc">Your personal information is handled with care.
            </p>
          </article>

          <article className="home-feature-card">
            <div className="home-feature-icon" aria-hidden="true"></div>
            <h2 className="home-feature-title">Fast and easy</h2>
            <p className="home-feature-desc">Find your next home in just a few simple steps.
            </p>
          </article>
        </section>
        <div className="home-image-credit" aria-hidden="true">Find a place to call home
        </div>
      </div>
    </div>
  );
};

export default Home;