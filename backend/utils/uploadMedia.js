const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLOUDINARY_CREDENTIAL_NAMES = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];
const isConfiguredValue = value => (
  typeof value === 'string'
  && value.trim() !== ''
  && !/^(your_|change|replace|example|xxxxx)/i.test(value.trim())
);
const hasCloudinaryCredentials = CLOUDINARY_CREDENTIAL_NAMES
  .every(name => isConfiguredValue(process.env[name]));

const getCloudinaryConfigurationError = (environment = process.env) => {
  const missingCredentials = CLOUDINARY_CREDENTIAL_NAMES
    .filter(name => !isConfiguredValue(environment[name]));
  const isProduction = environment.NODE_ENV === 'production'
    || environment.RENDER === 'true'
    || Boolean(environment.RENDER_SERVICE_ID);
  if (!isProduction || missingCredentials.length === 0) return null;

  const error = new Error(
    `Cloudinary uploads are not configured on the backend. Set ${missingCredentials.join(', ')}.`,
  );
  error.statusCode = 503;
  error.code = 'CLOUDINARY_CONFIGURATION_ERROR';
  return error;
};

const assertUploadConfiguration = () => {
  const error = getCloudinaryConfigurationError();
  if (error) throw error;
};

const redactCredentialValues = message => {
  let safeMessage = String(message || '');
  for (const name of CLOUDINARY_CREDENTIAL_NAMES) {
    const value = process.env[name]?.trim();
    if (value) safeMessage = safeMessage.split(value).join('[REDACTED]');
  }
  return safeMessage.replace(
    /\b(api[_ -]?key|api[_ -]?secret|secret|signature)(?:\s*[:=]\s*|\s+)[^\s,;"']+/gi,
    '$1 [REDACTED]',
  );
};

const logCloudinaryUploadError = error => {
  const httpCode = Number(error?.http_code);
  console.error('Cloudinary upload failed:', {
    message: redactCredentialValues(error?.message),
    ...(Number.isFinite(httpCode) ? { httpCode } : {}),
  });
};

const sanitizeCloudinaryUploadError = error => {
  logCloudinaryUploadError(error);

  const message = String(error?.message || '');
  const invalidCredentials = /invalid\s+(?:api[_ ]key|cloud[_ ]name|signature)|(?:api[_ ]key|cloud[_ ]name).*(?:invalid|does not exist)|must supply (?:api[_ ]key|api[_ ]secret|cloud[_ ]name)/i
    .test(message);
  const isConfigurationError = invalidCredentials || [401, 403].includes(error?.http_code);
  const sanitizedError = isConfigurationError
    ? new Error(
      'Cloudinary rejected the backend upload credentials. Verify CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the backend environment.',
    )
    : new Error('Cloudinary could not complete the file upload. Check the backend upload service and try again.');
  sanitizedError.statusCode = isConfigurationError ? 503 : 502;
  sanitizedError.code = isConfigurationError
    ? 'CLOUDINARY_CONFIGURATION_ERROR'
    : 'CLOUDINARY_UPLOAD_ERROR';
  return sanitizedError;
};

const uploadBuffer = (buffer, resourceType = 'auto') => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { resource_type: resourceType },
    (error, result) => (error ? reject(sanitizeCloudinaryUploadError(error)) : resolve(result))
  );
  stream.end(buffer);
});

const uploadPrivateProof = async (buffer) => {
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', type: 'authenticated' },
      (error, uploadedAsset) => (
        error ? reject(sanitizeCloudinaryUploadError(error)) : resolve(uploadedAsset)
      )
    );
    stream.end(buffer);
  });

  if (!result?.public_id || result.resource_type !== 'image' || result.type !== 'authenticated') {
    throw new Error('Cloudinary did not confirm authenticated delivery for the ownership proof');
  }

  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format,
    deliveryType: result.type,
  };
};

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
  assertUploadConfiguration();

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
  getCloudinaryConfigurationError,
  assertUploadConfiguration,
  sanitizeCloudinaryUploadError,
  uploadBuffer,
  uploadPrivateProof,
  saveLocalUpload,
  uploadFilesToUrls,
};
