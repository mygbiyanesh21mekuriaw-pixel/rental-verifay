const test = require('node:test');
const assert = require('node:assert/strict');
const cloudinary = require('../config/cloudinary');
const { uploadBuffer, uploadPrivateProof } = require('../utils/uploadMedia');
const {
  PROOF_URL_TTL_SECONDS,
  createExpiringDownloadUrl,
  downloadPrivateProof,
  validateCloudinaryAsset,
} = require('./privateOwnershipProof');

const privateAsset = {
  publicId: 'ownership/proof_123',
  resourceType: 'image',
  format: 'png',
  deliveryType: 'authenticated',
};

const withTestCloudinaryConfig = async (callback) => {
  const originalConfig = { ...cloudinary.config() };
  cloudinary.config({
    cloud_name: 'rentalverify-test',
    api_key: 'test-api-key',
    api_secret: 'test-api-secret',
  });
  try {
    await callback();
  } finally {
    cloudinary.config(originalConfig);
  }
};

test('generates an expiring authenticated download request without exposing it as a client URL', async () => {
  await withTestCloudinaryConfig(async () => {
    const now = 1_800_000_000_000;
    const { url, expiresAt } = createExpiringDownloadUrl(privateAsset, now);
    const parsedUrl = new URL(url);

    assert.equal(expiresAt, Math.floor(now / 1000) + PROOF_URL_TTL_SECONDS);
    assert.equal(Number(parsedUrl.searchParams.get('expires_at')), expiresAt);
    assert.equal(parsedUrl.searchParams.get('type'), 'authenticated');
    assert.equal(parsedUrl.searchParams.get('public_id'), privateAsset.publicId);
    assert.equal(parsedUrl.searchParams.get('api_key'), 'test-api-key');
    assert.ok(parsedUrl.searchParams.get('signature'));
  });
});

test('streams an authenticated proof only when Cloudinary accepts its unexpired signature', async () => {
  await withTestCloudinaryConfig(async () => {
    let requestedUrl;
    const bytes = Buffer.from('image');
    const result = await downloadPrivateProof(privateAsset, {
      now: 1_800_000_000_000,
      fetchImpl: async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === 'content-type' ? 'image/png' : '5') },
          arrayBuffer: async () => bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        };
      },
    });

    assert.equal(new URL(requestedUrl).searchParams.get('type'), 'authenticated');
    assert.equal(result.contentType, 'image/png');
    assert.equal(result.buffer.toString(), 'image');
  });
});

test('expired Cloudinary signed downloads are not served', async () => {
  await withTestCloudinaryConfig(async () => {
    await assert.rejects(
      downloadPrivateProof(privateAsset, {
        fetchImpl: async () => ({
          ok: false,
          status: 410,
          headers: { get: () => null },
        }),
      }),
      (error) => error.statusCode === 404 && /expired/.test(error.message),
    );
  });
});

test('rejects missing, malformed, or non-authenticated asset metadata', () => {
  assert.throws(() => validateCloudinaryAsset(null), { statusCode: 409 });
  assert.throws(() => validateCloudinaryAsset({
    ...privateAsset,
    publicId: '../other-account/asset',
  }), { statusCode: 409 });
  assert.throws(() => validateCloudinaryAsset({
    ...privateAsset,
    deliveryType: 'upload',
  }), { statusCode: 409 });
});

test('uploads proof files with Cloudinary authenticated delivery and validates the result', async () => {
  const originalUploadStream = cloudinary.uploader.upload_stream;
  let uploadOptions;
  cloudinary.uploader.upload_stream = (options, callback) => {
    uploadOptions = options;
    return {
      end: () => callback(null, {
        public_id: 'ownership/private_proof',
        resource_type: 'image',
        type: 'authenticated',
        format: 'png',
      }),
    };
  };

  try {
    const uploaded = await uploadPrivateProof(Buffer.from('proof'));
    assert.deepEqual(uploadOptions, { resource_type: 'image', type: 'authenticated' });
    assert.deepEqual(uploaded, {
      publicId: 'ownership/private_proof',
      resourceType: 'image',
      format: 'png',
      deliveryType: 'authenticated',
    });

    test('ordinary listing-image uploads retain public image delivery', async () => {
      const originalUploadStream = cloudinary.uploader.upload_stream;
      let uploadOptions;
      cloudinary.uploader.upload_stream = (options, callback) => {
        uploadOptions = options;
        return {
          end: () => callback(null, {
            secure_url: 'https://res.cloudinary.com/example/image/upload/listing.jpg',
            resource_type: 'image',
            type: 'upload',
          }),
        };
      };

      try {
        await uploadBuffer(Buffer.from('listing-image'), 'image');
        assert.deepEqual(uploadOptions, { resource_type: 'image' });
      } finally {
        cloudinary.uploader.upload_stream = originalUploadStream;
      }
    });

    cloudinary.uploader.upload_stream = (options, callback) => ({
      end: () => callback(null, {
        public_id: 'ownership/public_proof',
        resource_type: 'image',
        type: 'upload',
        format: 'png',
      }),
    });
    await assert.rejects(
      uploadPrivateProof(Buffer.from('proof')),
      /did not confirm authenticated delivery/,
    );
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
  }
});

test('rejects an expired or unavailable Cloudinary asset without returning its signed URL', async () => {
  await withTestCloudinaryConfig(async () => {
    await assert.rejects(
      downloadPrivateProof(privateAsset, {
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          headers: { get: () => null },
        }),
      }),
      (error) => error.statusCode === 404 && !error.message.includes('https://'),
    );
  });
});
