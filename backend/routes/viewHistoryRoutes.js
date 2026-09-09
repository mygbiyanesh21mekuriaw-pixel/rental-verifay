const express = require('express');
const router = express.Router();
const {
  recordPropertyView,
  getMyViewHistory,
} = require('../controllers/viewHistoryController');
const { auth } = require('../middleware/auth');

router.post('/', auth, (req, res, next) => {
  if (req.user.role !== 'tenant') {
    return res.status(403).json({ message: 'Only tenants can record view history' });
  }
  next();
}, recordPropertyView);

router.get('/my-history', auth, (req, res, next) => {
  if (req.user.role !== 'tenant') {
    return res.status(403).json({ message: 'Only tenants can view history' });
  }
  next();
}, getMyViewHistory);

module.exports = router;
