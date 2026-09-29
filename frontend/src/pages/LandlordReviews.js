import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './landlordDashboard.css';

const LandlordReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('token');

    axios.get('http://localhost:5000/api/reviews/landlord', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((response) => {
      if (active) setReviews(Array.isArray(response.data) ? response.data : []);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || 'Unable to load tenant reviews.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, []);

  return (
    <main className="landlord-reviews-page">
      <header className="landlord-reviews-header">
        <p className="landlord-reviews-eyebrow">RENTER FEEDBACK</p>
        <h1>Tenant Reviews</h1>
        <p>Reviews from tenants who rented your properties.</p>
      </header>

      {loading && <p className="landlord-reviews-state">Loading reviews...</p>}
      {!loading && error && <p className="landlord-reviews-state error" role="alert">{error}</p>}
      {!loading && !error && reviews.length === 0 && (
        <p className="landlord-reviews-state">No tenant reviews yet.</p>
      )}
      {!loading && !error && reviews.length > 0 && (
        <div className="landlord-review-list">
          {reviews.map((review) => (
            <article className="landlord-review-card" key={review._id}>
              <div className="landlord-review-topline">
                <div>
                  <h2>{review.tenant?.name || 'Tenant'}</h2>
                  <p>{review.property?.title || 'Property'}</p>
                </div>
                <div className="landlord-review-meta">
                  <span className="landlord-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                    {'⭐'.repeat(review.rating)}
                  </span>
                  <time dateTime={review.createdAt}>
                    {new Date(review.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </time>
                </div>
              </div>
              <p className="landlord-review-comment">“{review.comment}”</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
};

export default LandlordReviews;
