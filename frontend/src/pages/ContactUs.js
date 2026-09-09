import React, { useState } from 'react';
import './contactUs.css';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // ለአሁን ለማሳያ ብቻ
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="contact-container">
      <div className="contact-hero">
        <h1 className="contact-title">📞 Contact Us</h1>
        <p className="contact-subtitle">
          Contact us with any questions or feedback.
        </p>
      </div>

      <div className="contact-content">
        <div className="contact-info">
          <div className="contact-info-card">
            <span className="contact-info-icon">📍</span>
            <h3>Address</h3>
            <p>Addis Ababa, Ethiopia</p>
          </div>
          <div className="contact-info-card">
            <span className="contact-info-icon">📞</span>
            <h3>Phone</h3>
            <p>+251 9XX-XXXXXX</p>
          </div>
          <div className="contact-info-card">
            <span className="contact-info-icon">📧</span>
            <h3>Email</h3>
            <p>info@rentalverify.com</p>
          </div>
          <div className="contact-info-card">
            <span className="contact-info-icon">🕐</span>
            <h3>Business hours</h3>
            <p>Monday - Saturday: 8:00 - 18:00</p>
          </div>
        </div>

        <div className="contact-form-container">
          <h2>📝 Send us a message</h2>
          {submitted ? (
            <div className="contact-success">
              ✅ Your message was sent successfully!
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="contact-form">
              <div className="contact-form-group">
                <label className="contact-form-label">Full name</label>
                <input
                  type="text"
                  name="name"
                  className="contact-form-input"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="contact-form-group">
                <label className="contact-form-label">Email</label>
                <input
                  type="email"
                  name="email"
                  className="contact-form-input"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="contact-form-group">
                <label className="contact-form-label">Subject</label>
                <input
                  type="text"
                  name="subject"
                  className="contact-form-input"
                  placeholder="Message subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="contact-form-group">
                <label className="contact-form-label">Message</label>
                <textarea
                  name="message"
                  className="contact-form-input contact-form-textarea"
                  placeholder="Write your message..."
                  value={formData.message}
                  onChange={handleChange}
                  required
                />
              </div>
              <button type="submit" className="contact-form-btn">
                📤 Send message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Contact;