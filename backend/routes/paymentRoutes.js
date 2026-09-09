const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  createPayment,
  getTenantPaymentContext,
  getLandlordPayments,
  chapaCallback,
} = require('../controllers/paymentController');

router.post('/', auth, createPayment);
router.get('/callback/chapa', chapaCallback);
router.post('/callback/chapa', chapaCallback);
router.get('/tenant/property/:propertyId', auth, getTenantPaymentContext);
router.get('/landlord', auth, (req, res, next) => {
  if (req.user.role !== 'landlord') return res.status(403).json({ message: 'Landlords only' });
  next();
}, getLandlordPayments);

module.exports = router;
