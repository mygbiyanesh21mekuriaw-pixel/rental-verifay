const express = require('express');
const {
  getSystemSettings,
  updateSystemSettings,
  uploadWebsiteLogo,
} = require('../controllers/systemSettingsController');
const { auth, platformAdminOnly } = require('../middleware/auth');
const multer = require('multer');

const router = express.Router();
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    callback(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype));
  },
});

router.get('/', auth, platformAdminOnly, getSystemSettings);
router.put('/', auth, platformAdminOnly, updateSystemSettings);
router.post('/logo', auth, platformAdminOnly, logoUpload.single('logo'), uploadWebsiteLogo);

module.exports = router;
