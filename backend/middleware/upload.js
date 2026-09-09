const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = /jpeg|jpg|png|webp/;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const extensionIsAllowed = ALLOWED_IMAGE_EXTENSIONS.test(extension);
  const mimeTypeIsAllowed = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);

  if (extensionIsAllowed && mimeTypeIsAllowed) {
    return cb(null, true);
  }

  cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed.'));
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 6,
  },
  fileFilter,
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File too large. Maximum allowed size is 10 MB per file.',
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'You can upload up to 5 property images and 1 proof of ownership image.',
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Unsupported file upload.',
      });
    }
  }

  if (err && err.message === 'Only JPG, JPEG, PNG, and WEBP images are allowed.') {
    return res.status(400).json({ message: err.message });
  }

  next(err);
};

module.exports = { upload, handleMulterError, MAX_FILE_SIZE };