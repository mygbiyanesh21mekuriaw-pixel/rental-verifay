const express = require('express');
const router = express.Router();
const { auth, adminOnly, requirePermission } = require('../middleware/auth');
const {
  openConversation,
  getConversation,
  sendMessage,
  sendAdminMessage,
  getLandlordConversations,
  getTenantConversations,
  getAdminConversations,
} = require('../controllers/messageController');

router.post('/conversations/open', auth, requirePermission('messages'), openConversation);
router.get('/admin/conversations', auth, adminOnly, requirePermission('messages'), getAdminConversations);
router.post('/admin/conversations/:id/messages', auth, adminOnly, requirePermission('messages'), sendAdminMessage);
router.get('/conversations', auth, requirePermission('messages'), (req, res, next) => {
  if (req.user.role !== 'landlord') return res.status(403).json({ message: 'Landlords only' });
  next();
}, getLandlordConversations);
router.get('/tenant/conversations', auth, requirePermission('messages'), (req, res, next) => {
  if (req.user.role !== 'tenant') return res.status(403).json({ message: 'Tenants only' });
  next();
}, getTenantConversations);
router.get('/conversations/:id', auth, requirePermission('messages'), getConversation);
router.post('/conversations/:id/messages', auth, requirePermission('messages'), sendMessage);

module.exports = router;
