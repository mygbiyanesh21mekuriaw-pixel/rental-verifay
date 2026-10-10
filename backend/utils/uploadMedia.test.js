const test = require('node:test');
const assert = require('node:assert/strict');
const cloudinary = require('../config/cloudinary');
const {
  getCloudinaryConfigurationError,
  uploadBuffer,
} = require('./uploadMedia');

test('production upload configuration errors identify missing server-side variables', () => {
  const error = getCloudinaryConfigurationError({
    NODE_ENV: 'production',
    CLOUDINARY_CLOUD_NAME: 'rentalverify',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: 'configured-secret',
  });

  assert.equal(error.statusCode, 503);
  assert.equal(error.code, 'CLOUDINARY_CONFIGURATION_ERROR');
  assert.match(error.message, /CLOUDINARY_API_KEY/);
  assert.doesNotMatch(error.message, /configured-secret/);
});

test('Render requires Cloudinary credentials even without NODE_ENV=production', () => {
  const error = getCloudinaryConfigurationError({
    RENDER: 'true',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
  });

  assert.equal(error.statusCode, 503);
  assert.match(error.message, /CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/);
});

test('development keeps its local upload fallback when Cloudinary is not configured', () => {
  assert.equal(getCloudinaryConfigurationError({
    NODE_ENV: 'development',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
  }), null);
});

test('sanitizes Cloudinary invalid API key responses without echoing the key', async () => {
  const originalUploadStream = cloudinary.uploader.upload_stream;
  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);
  cloudinary.uploader.upload_stream = (options, callback) => ({
    end: () => callback(new Error('Invalid api_key test-api-key')),
  });

  try {
    await assert.rejects(
      uploadBuffer(Buffer.from('listing-image'), 'image'),
      error => (
        error.statusCode === 503
        && error.code === 'CLOUDINARY_CONFIGURATION_ERROR'
        && /Verify CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET/.test(error.message)
        && !error.message.includes('test-api-key')
      ),
    );
    assert.equal(loggedErrors.length, 1);
    assert.match(JSON.stringify(loggedErrors[0]), /Invalid api_key \[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(loggedErrors[0]), /test-api-key/);
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
    console.error = originalConsoleError;
  }
});

test('sanitizes non-credential Cloudinary failures before returning them to callers', async () => {
  const originalUploadStream = cloudinary.uploader.upload_stream;
  const originalConsoleError = console.error;
  cloudinary.uploader.upload_stream = (options, callback) => ({
    end: () => callback(new Error('Cloudinary internal failure')),
  });
  console.error = () => {};

  try {
    await assert.rejects(
      uploadBuffer(Buffer.from('listing-image'), 'image'),
      error => (
        error.statusCode === 502
        && error.code === 'CLOUDINARY_UPLOAD_ERROR'
        && !error.message.includes('internal failure')
      ),
    );
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
    console.error = originalConsoleError;
  }
});
