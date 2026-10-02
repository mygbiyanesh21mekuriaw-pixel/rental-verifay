const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hasCloudinaryCredentials = [
  process.env.CLOUDINARY_CLOUD_NAME,
  process.env.CLOUDINARY_API_KEY,
  process.env.CLOUDINARY_API_SECRET,
].every(value => value && !/^your_|change|replace|example|xxxxx/i.test(value));

const uploadBuffer = (buffer, resourceType = 'auto') => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { resource_type: resourceType },
    (error, result) => (error ? reject(error) : resolve(result))
  );
  stream.end(buffer);
});

const saveLocalUpload = (file, req) => {
  const uploadsDirectory = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDirectory, { recursive: true });
  const extension = path.extname(file.originalname).toLowerCase() || '.bin';
  const filename = `${crypto.randomUUID()}${extension}`;
  fs.writeFileSync(path.join(uploadsDirectory, filename), file.buffer);
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
};

const uploadFilesToUrls = async (files, req, resourceType = 'image') => {
  if (!files || files.length === 0) return [];

  const urls = [];
  for (const file of files) {
    if (hasCloudinaryCredentials) {
      const result = await uploadBuffer(file.buffer, resourceType);
      urls.push(result.secure_url);
    } else {
      urls.push(saveLocalUpload(file, req));
    }
  }

  return urls;
};

module.exports = {
  hasCloudinaryCredentials,
  uploadBuffer,
  saveLocalUpload,
  uploadFilesToUrls,
};
