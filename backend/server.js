const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const morgan = require('morgan');
const multer = require('multer');
const connectDB = require('./config/db');
const createAdmin = require('./create-admin');

// የአካባቢ ተለዋዋጮችን ጫን
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/properties', require('./routes/propertyRoutes'));
app.use('/api/rent-requests', require('./routes/rentRequestRoutes'));
app.use('/api/rental-requests', require('./routes/rentRequestRoutes'));
app.use('/api/view-history', require('./routes/viewHistoryRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/favorites', require('./routes/favoriteRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/admin', require('./routes/systemLogRoutes'));

app.get('/', (req, res) => {
  res.json({ message: 'Rental Property Verification API is running' });
});

app.use(morgan('dev'));

app.use((err, req, res, next) => {
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

  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const startServer = async () => {
  await connectDB();
  await createAdmin();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});