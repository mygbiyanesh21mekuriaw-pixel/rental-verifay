const express = require('express');
const router = express.Router();
const {
  createProperty,
  getAllProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
} = require('../controllers/propertyController');
const { auth, optionalAuth, landlordOnly, landlordCreateOnly } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');

// ሁሉም ሰው የተረጋገጡ ንብረቶችን ማየት ይችላል
router.get('/', optionalAuth, getAllProperties);
router.get('/:id', optionalAuth, getPropertyById);

// Landlord ብቻ ንብረት መፍጠር፣ ማዘመን፣ መሰረዝ ይችላል
router.post('/', auth, landlordCreateOnly, upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'document', maxCount: 1 },
]), handleMulterError, createProperty);

router.put('/:id', auth, landlordOnly, upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'document', maxCount: 1 },
]), handleMulterError, updateProperty);
router.delete('/:id', auth, landlordOnly, deleteProperty);

module.exports = router;