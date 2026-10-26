const express = require('express');
const router = express.Router();
const { auth, requirePermission } = require('../middleware/auth');
const {
  createPayment,
  getTenantPaymentContext,
  getLandlordPayments,
  chapaCallback,
  getChapaBanks,
} = require('../controllers/paymentController');

router.post('/', auth, requirePermission('rentPayments'), createPayment);
router.get('/banks', auth, requirePermission('rentPayments'), getChapaBanks);
router.get('/callback/chapa', chapaCallback);
router.post('/callback/chapa', chapaCallback);
router.get('/tenant/property/:propertyId', auth, requirePermission('rentPayments'), getTenantPaymentContext);
router.get('/landlord', auth, requirePermission('rentPayments'), (req, res, next) => {
  if (req.user.role !== 'landlord') return res.status(403).json({ message: 'Landlords only' });
  next();
}, getLandlordPayments);

module.exports = router;
