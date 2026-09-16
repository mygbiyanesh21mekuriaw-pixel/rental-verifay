const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  openConversation,
  getConversation,
  sendMessage,
  sendAdminMessage,
  getLandlordConversations,
  getTenantConversations,
  getAdminConversations,
} = require('../controllers/messageController');

router.post('/conversations/open', auth, openConversation);
router.get('/admin/conversations', auth, (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  next();
}, getAdminConversations);
router.post('/admin/conversations/:id/messages', auth, (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
  next();
}, sendAdminMessage);
router.get('/conversations', auth, (req, res, next) => {
  if (req.user.role !== 'landlord') return res.status(403).json({ message: 'Landlords only' });
  next();
}, getLandlordConversations);
router.get('/tenant/conversations', auth, (req, res, next) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ message: 'Tenants only' });
  next();
}, getTenantConversations);
router.get('/conversations/:id', auth, getConversation);
router.post('/conversations/:id/messages', auth, sendMessage);

module.exports = router;
