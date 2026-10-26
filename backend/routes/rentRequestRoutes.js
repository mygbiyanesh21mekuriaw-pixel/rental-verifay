const express = require('express');

const router = express.Router();

const {
  createRentalRequest,
  getMyRentalRequests,
  getMyRentalRequestById,
  getLandlordRentalRequests,
  getRentRequestForLandlord,
  getLandlordRentStats,
  landlordRespondToRequest,
  getAdminRentalRequests,
  adminRespondToRentalRequest,
} = require('../controllers/rentalRequestController');

const { auth, adminOnly, areaAdminOnly, requirePermission } = require('../middleware/auth');

router.get('/admin-requests', auth, adminOnly, requirePermission('rentalRequests'), getAdminRentalRequests);
router.put('/admin-requests/:id/respond', auth, areaAdminOnly, requirePermission('rentalRequests'), adminRespondToRentalRequest);

// =====================================================
// TENANT
// =====================================================

// Create rental request
router.post(
  '/',
  auth,
  requirePermission('rentalRequests'),
  (req, res, next) => {
    if (req.user.role !== 'tenant') {
      return res.status(403).json({
        message: 'Only tenants can submit rental requests',
      });
    }

    next();
  },
  createRentalRequest
);

// Get my rental requests
router.get(
  '/my-requests',
  auth,
  requirePermission('rentalRequests'),
  (req, res, next) => {
    if (req.user.role !== 'tenant') {
      return res.status(403).json({
        message: 'Only tenants can view their rental requests',
      });
    }

    next();
  },
  getMyRentalRequests
);

// Get one of my rental requests
router.get(
  '/my-requests/:id',
  auth,
  requirePermission('rentalRequests'),
  (req, res, next) => {
    if (req.user.role !== 'tenant') {
      return res.status(403).json({
        message: 'Only tenants can view their rental requests',
      });
    }

    next();
  },
  getMyRentalRequestById
);

// =====================================================
// LANDLORD
// =====================================================

// Get landlord rental requests
router.get(
  '/landlord-requests',
  auth,
  requirePermission('rentalRequests'),
  (req, res, next) => {
    if (req.user.role !== 'landlord') {
      return res.status(403).json({
        message: 'Only landlords can view rental requests',
      });
    }

    next();
  },
  getLandlordRentalRequests
);

// Get landlord rental request statistics
router.get(
  '/landlord-stats',
  auth,
  requirePermission('rentalRequests'),
  (req, res, next) => {
    if (req.user.role !== 'landlord') {
      return res.status(403).json({
        message: 'Only landlords can view rental request statistics',
      });
    }

    next();
  },
  getLandlordRentStats
);

// Get one rental request for landlord review
router.get(
  '/landlord-requests/:id',
  auth,
  requirePermission('rentalRequests'),
  (req, res, next) => {
    if (req.user.role !== 'landlord') {
      return res.status(403).json({
        message: 'Only landlords can view rental request details',
      });
    }

    next();
  },
  getRentRequestForLandlord
);

// Landlord Approve / Reject rental request
router.put(
  '/landlord-requests/:id/respond',
  auth,
  requirePermission('rentalRequests'),
  (req, res, next) => {
    if (req.user.role !== 'landlord') {
      return res.status(403).json({
        message: 'Only landlords can respond to rental requests',
      });
    }

    next();
  },
  landlordRespondToRequest
);

module.exports = router;