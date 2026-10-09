const cloudinary = require('../config/cloudinary');

const PROOF_URL_TTL_SECONDS = 60;
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const validateCloudinaryAsset = (asset) => {
  if (
    !asset ||
    typeof asset.publicId !== 'string' ||
    !/^[A-Za-z0-9_/-]+$/.test(asset.publicId) ||
    asset.publicId.includes('..') ||
    !['image', 'raw'].includes(asset.resourceType) ||
    asset.deliveryType !== 'authenticated' ||
    (asset.format && !/^[A-Za-z0-9]+$/.test(asset.format))
  ) {
    const error = new Error('Ownership proof asset metadata is invalid or not private');
    error.statusCode = 409;
    throw error;
  }
};

const createExpiringDownloadUrl = (asset, now = Date.now()) => {
  validateCloudinaryAsset(asset);
  const expiresAt = Math.floor(now / 1000) + PROOF_URL_TTL_SECONDS;
  const url = cloudinary.utils.private_download_url(
    asset.publicId,
    asset.format || '',
    {
      resource_type: asset.resourceType,
      type: asset.deliveryType,
      expires_at: expiresAt,
      secure: true,
    },
  );

  return { url, expiresAt };
};

const downloadPrivateProof = async (asset, { fetchImpl = global.fetch, now = Date.now() } = {}) => {
  const { url, expiresAt } = createExpiringDownloadUrl(asset, now);
  const downloadUrl = new URL(url);
  if (downloadUrl.protocol !== 'https:' || !downloadUrl.hostname.endsWith('.cloudinary.com')) {
    throw new Error('Cloudinary generated an unexpected ownership proof download URL');
  }

  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    console.error('Cloudinary ownership proof download failed:', error.message);
    const unavailable = new Error('Ownership proof is temporarily unavailable');
    unavailable.statusCode = 502;
    throw unavailable;
  }

  if ([401, 403, 404, 410].includes(response.status)) {
    const missing = new Error('Ownership proof is unavailable or its signed access has expired');
    missing.statusCode = 404;
    throw missing;
  }
  if (!response.ok) {
    const unavailable = new Error('Ownership proof is temporarily unavailable');
    unavailable.statusCode = 502;
    throw unavailable;
  }

  const contentType = String(response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    const invalid = new Error('Ownership proof has an unsupported file type');
    invalid.statusCode = 415;
    throw invalid;
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_PROOF_SIZE_BYTES) {
    const tooLarge = new Error('Ownership proof exceeds the allowed file size');
    tooLarge.statusCode = 413;
    throw tooLarge;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_PROOF_SIZE_BYTES) {
    const invalid = new Error('Ownership proof is empty or exceeds the allowed file size');
    invalid.statusCode = buffer.length > MAX_PROOF_SIZE_BYTES ? 413 : 404;
    throw invalid;
  }

  return { buffer, contentType, expiresAt };
};

module.exports = {
  PROOF_URL_TTL_SECONDS,
  createExpiringDownloadUrl,
  downloadPrivateProof,
  validateCloudinaryAsset,
};
