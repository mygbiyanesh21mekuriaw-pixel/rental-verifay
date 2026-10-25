const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');
const Area = require('../models/Area');
const { getAdministrativeRole } = require('../middleware/auth');
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

const getAreaAdminEmails = async (areaName) => {
  const escapedArea = String(areaName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactArea = new RegExp(`^${escapedArea}$`, 'i');
  const admins = await User.find({
    role: 'admin',
    isActive: { $ne: false },
    $and: [
      { $or: [{ adminType: 'area' }, { adminType: { $exists: false }, adminAreas: { $ne: [] } }] },
      {
        $or: [
          { assignedArea: exactArea },
          { 'adminAreas.region': exactArea },
          { 'adminAreas.zone': exactArea },
          { 'adminAreas.wereda': exactArea },
          { 'adminAreas.city': exactArea },
          { 'adminAreas.subCity': exactArea },
        ],
      },
    ],
  }).select('email').lean();
  return [...new Set(admins.map((admin) => String(admin.email || '').trim()).filter(Boolean))];
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
    const areaName = String(req.body.area || '').trim();

    if (!name || !email || !subject || !message || !areaName) {
      return res.status(400).json({ message: 'Name, email, subject, message and area are required.' });
    }
    if (!emailPattern.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (name.length > 120 || email.length > 254 || subject.length > 180 || message.length > 5000) {
      return res.status(400).json({ message: 'One or more fields exceed the maximum length.' });
    }
    const area = await Area.findOne({ normalizedName: areaName.toLowerCase() }).select('name').lean();
    if (!area) return res.status(400).json({ message: 'Select an existing area.' });
    const contactMessage = await ContactMessage.create({ name, email, subject, message, area: area.name });
    try {
      const areaAdminEmails = await getAreaAdminEmails(area.name);
      if (areaAdminEmails.length && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        await Promise.all(areaAdminEmails.map((adminEmail) => sendEmail({
          to: adminEmail,
          subject: `Contact Us: ${subject}`,
          text: `From: ${name} <${email}>\n\n${message}`,
          html: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
        })));
      }
    } catch (emailError) {
      console.error('Contact message was saved, but email notification to the Platform Admin failed:', emailError);
    }

    res.status(201).json({
      message: 'Your message was saved in the Platform Admin contact inbox.',
      contactMessageId: contactMessage._id,
    });
  } catch (error) {
    console.error('Contact message submission error:', error);
    res.status(500).json({ message: 'Unable to send your message right now.' });
  }
};

const getPlatformContactMessages = async (req, res) => {
  try {
    if (getAdministrativeRole(req.user) !== 'area_admin' || !req.user.assignedArea) {
      return res.json([]);
    }
    const escapedArea = req.user.assignedArea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = { area: new RegExp(`^${escapedArea}$`, 'i') };
    const messages = await ContactMessage.find(filter).sort({ createdAt: -1 }).lean();
    res.json(messages);
  } catch (error) {
    console.error('Contact inbox error:', error);
    res.status(500).json({ message: 'Unable to load contact messages.' });
  }
};

const markContactMessageRead = async (req, res) => {
  try {
    if (getAdministrativeRole(req.user) !== 'area_admin' || !req.user.assignedArea) {
      return res.status(403).json({ message: 'Area Admin permission required.' });
    }
    const filter = { _id: req.params.id };
    const escapedArea = req.user.assignedArea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.area = new RegExp(`^${escapedArea}$`, 'i');
    const contactMessage = await ContactMessage.findOneAndUpdate(
      filter,
      { $set: { read: true } },
      { returnDocument: 'after', runValidators: true }
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
