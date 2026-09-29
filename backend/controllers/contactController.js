const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');
const sendEmail = require('../utils/email');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getPlatformAdminEmail = async () => {
  const platformAdmin = await User.findOne({
    role: 'admin',
    $or: [
      { adminType: 'platform' },
      { adminType: { $exists: false }, adminAreas: { $size: 0 } },
    ],
  }).select('email').lean();

  return String(platformAdmin?.email || process.env.ADMIN_EMAIL || '').trim();
};

const getContactDetails = async (req, res) => {
  try {
    res.json({ email: await getPlatformAdminEmail() });
  } catch (error) {
    console.error('Contact details lookup error:', error);
    res.status(500).json({ message: 'Unable to load contact details.' });
  }
};

const submitContactMessage = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'Name, email, subject and message are required.' });
    }
    if (!emailPattern.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (name.length > 120 || email.length > 254 || subject.length > 180 || message.length > 5000) {
      return res.status(400).json({ message: 'One or more fields exceed the maximum length.' });
    }

    const contactMessage = await ContactMessage.create({ name, email, subject, message });
    const adminEmail = await getPlatformAdminEmail();

    if (adminEmail && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await sendEmail({
        to: adminEmail,
        subject: `Contact Us: ${subject}`,
        text: `From: ${name} <${email}>\n\n${message}`,
        html: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      });
    }

    res.status(201).json({
      message: 'Your message was sent to the Platform Admin.',
      contactMessageId: contactMessage._id,
    });
  } catch (error) {
    console.error('Contact message submission error:', error);
    res.status(500).json({ message: 'Unable to send your message right now.' });
  }
};

const getPlatformContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 }).lean();
    res.json(messages);
  } catch (error) {
    console.error('Contact inbox error:', error);
    res.status(500).json({ message: 'Unable to load contact messages.' });
  }
};

const markContactMessageRead = async (req, res) => {
  try {
    const contactMessage = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { $set: { read: true } },
      { new: true, runValidators: true }
    );
    if (!contactMessage) return res.status(404).json({ message: 'Contact message not found.' });
    res.json(contactMessage);
  } catch (error) {
    console.error('Contact message update error:', error);
    res.status(500).json({ message: 'Unable to update contact message.' });
  }
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

module.exports = { getContactDetails, submitContactMessage, getPlatformContactMessages, markContactMessageRead };
