const express = require('express');
const router = express.Router();
const {
  createProperty,
  getAllProperties,
  getPropertyById,
  getOwnershipProof,
  getPropertyHistory,
  updateProperty,
  deleteProperty,
} = require('../controllers/propertyController');
const {
  auth,
  optionalAuth,
  areaAdminOnly,
  landlordOnly,
  landlordCreateOnly,
  landlordOwnerOrPlatformAdmin,
  requirePermission,
  requirePropertyAccess,
} = require('../middleware/auth');
const { propertySubmissionsEnabled } = require('../middleware/systemAccess');
const { upload, handleMulterError } = require('../middleware/upload');

// ሁሉም ሰው የተረጋገጡ ንብረቶችን ማየት ይችላል
router.get('/', optionalAuth, requirePropertyAccess, getAllProperties);
router.get('/:id/history', auth, areaAdminOnly, requirePermission('allProperties'), getPropertyHistory);
router.get('/:id/ownership-proof', auth, requirePropertyAccess, getOwnershipProof);
router.get('/:id', optionalAuth, requirePropertyAccess, getPropertyById);

// Landlord ብቻ ንብረት መፍጠር፣ ማዘመን፣ መሰረዝ ይችላል
router.post('/', auth, landlordCreateOnly, requirePermission('addProperty'), propertySubmissionsEnabled, upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'document', maxCount: 1 },
]), handleMulterError, createProperty);

router.put('/:id', auth, landlordOnly, requirePermission('myProperties'), landlordOwnerOrPlatformAdmin, upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'document', maxCount: 1 },
]), handleMulterError, updateProperty);
router.delete('/:id', auth, landlordOnly, requirePermission('myProperties'), landlordOwnerOrPlatformAdmin, deleteProperty);

module.exports = router;