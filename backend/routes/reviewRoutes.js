const express = require('express');
const {
  getPropertyReviews,
  getMyPropertyReview,
  createReview,
  getLandlordReviews,
} = require('../controllers/reviewController');
const { auth, optionalAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

const tenantOnly = (req, res, next) => {
  if (req.user.role !== 'tenant') {
    return res.status(403).json({ message: 'Only tenants can manage rental reviews.' });
  }
  next();
};

const landlordOnly = (req, res, next) => {
  if (req.user.role !== 'landlord') {
    return res.status(403).json({ message: 'Only landlords can view tenant reviews.' });
  }
  next();
};

router.get('/property/:propertyId', optionalAuth, requirePermission('reviews'), getPropertyReviews);
router.get('/my/:propertyId', auth, tenantOnly, requirePermission('reviews'), getMyPropertyReview);
router.post('/', auth, tenantOnly, requirePermission('reviews'), createReview);
router.get('/landlord', auth, landlordOnly, requirePermission('reviews'), getLandlordReviews);

module.exports = router;
