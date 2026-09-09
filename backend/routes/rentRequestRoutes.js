const express = require('express');

const router = express.Router();

const {
  createRentalRequest,
  getRentalRequests,
  getMyRentalRequests,
  getMyRentalRequestById,
  getLandlordRentalRequests,
  getRentRequestForLandlord,
  getLandlordRentStats,
  landlordRespondToRequest,
  updateRentalRequestStatus,
} = require('../controllers/rentalRequestController');

const { auth, adminOnly } = require('../middleware/auth');

// =====================================================
// TENANT
// =====================================================

// Create rental request
router.post(
  '/',
  auth,
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

// =====================================================
// ADMIN
// =====================================================

// Get all rental requests
router.get(
  '/all',
  auth,
  adminOnly,
  getRentalRequests
);

// Admin approve / reject rental request
router.put(
  '/:id/status',
  auth,
  adminOnly,
  updateRentalRequestStatus
);

module.exports = router;