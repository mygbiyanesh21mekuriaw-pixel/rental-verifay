const express = require('express');
const router = express.Router();
const {
  toggleFavorite,
  getMyFavorites,
  isFavorited,
} = require('../controllers/favoriteController');
const { auth, requirePermission } = require('../middleware/auth');

const tenantOnly = (req, res, next) => {
  if (req.user.role !== 'tenant') {
    return res.status(403).json({ message: 'Only tenants can manage favorites' });
  }
  next();
};

// Get all favorites for the authenticated tenant
router.get('/', auth, tenantOnly, requirePermission('favorites'), getMyFavorites);

// Check if a specific property is favorited
router.get('/:propertyId', auth, tenantOnly, requirePermission('favorites'), isFavorited);

// Toggle favorite status
router.post('/toggle', auth, tenantOnly, requirePermission('favorites'), toggleFavorite);

module.exports = router;
