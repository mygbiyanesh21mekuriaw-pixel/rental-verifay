const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const multer = require('multer');

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/system', require('./routes/systemRoutes'));
app.use(require('./middleware/systemAccess').maintenanceMode);
app.use('/uploads', require('./middleware/privateUpload').privateUploadAccess);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/areas', require('./routes/areaRoutes'));
app.use('/api/public/areas', require('./routes/publicAreaRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/properties', require('./routes/propertyRoutes'));
app.use('/api/chapa', require('./routes/chapaRoutes'));
app.use('/api/rent-requests', require('./routes/rentRequestRoutes'));
app.use('/api/rental-requests', require('./routes/rentRequestRoutes'));
app.use('/api/view-history', require('./routes/viewHistoryRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/bank-accounts', require('./routes/bankAccountRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/favorites', require('./routes/favoriteRoutes'));
app.use('/api/admin/system-settings', require('./routes/systemSettingsRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/admin', require('./routes/systemLogRoutes'));

app.get('/', (req, res) => {
  res.json({ message: 'Rental Property Verification API is running' });
});
app.get('/api/chapa/test', (req, res) => {
  res.json({
    success: true,
    message: 'Chapa route is connected'
  });
});

app.use(morgan('dev'));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: req.path === '/api/admin/system-settings/logo'
          ? 'Website logo must be 1 MB or smaller.'
          : 'File too large. Maximum allowed size is 10 MB per file.',
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

  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

module.exports = app;
