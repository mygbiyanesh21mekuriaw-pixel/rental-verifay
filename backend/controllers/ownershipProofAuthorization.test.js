const test = require('node:test');
const assert = require('node:assert/strict');
const cloudinary = require('../config/cloudinary');
const Property = require('../models/Property');
const propertyRoutes = require('../routes/propertyRoutes');
const { getOwnershipProof } = require('./propertyController');

const ownerId = '507f1f77bcf86cd799439011';
const propertyId = '507f1f77bcf86cd799439012';
const cloudAsset = {
  publicId: 'ownership/proof_123',
  resourceType: 'image',
  format: 'png',
  deliveryType: 'authenticated',
};

const createResponse = () => ({
  statusCode: null,
  body: null,
  headers: {},
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  set(headers) {
    Object.assign(this.headers, headers);
    return this;
  },
  type(contentType) {
    this.contentType = contentType;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
});

const createPropertyQuery = (property) => ({
  select() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(property).then(resolve, reject);
  },
});

const withMocks = async (property, callback) => {
  const originalFindById = Property.findById;
  Property.findById = () => createPropertyQuery(property);
  try {
    await callback();
  } finally {
    Property.findById = originalFindById;
  }
};

const withCloudinaryConfig = async (callback) => {
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

const privateProperty = (overrides = {}) => ({
  _id: propertyId,
  landlord: ownerId,
  city: 'Mekelle',
  verificationDocument: '',
  verificationDocumentAsset: cloudAsset,
  ...overrides,
});

test('property ownership-proof route authenticates requests before delivery', () => {
  const route = propertyRoutes.stack.find(
    (layer) => layer.route?.path === '/:id/ownership-proof',
  );

  assert.ok(route);
  assert.equal(route.route.stack[0].handle.name, 'auth');
});

test('owning landlord receives private proof bytes through a non-cacheable authorized response', async () => {
  await withCloudinaryConfig(async () => {
    const originalFetch = global.fetch;
    const bytes = Buffer.from('private-proof');
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-type' ? 'image/png' : String(bytes.length)) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    try {
      await withMocks(privateProperty(), async () => {
        const response = createResponse();
        await getOwnershipProof(
          { params: { id: propertyId }, user: { id: ownerId, role: 'landlord' } },
          response,
        );

        assert.equal(response.statusCode, null);
        assert.equal(response.contentType, 'image/png');
        assert.equal(response.body.toString(), 'private-proof');
        assert.equal(response.headers['Cache-Control'], 'private, no-store');
        assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('tenant and unrelated landlord cannot request an ownership proof', async () => {
  await withMocks(privateProperty(), async () => {
    for (const user of [
      { id: '507f1f77bcf86cd799439013', role: 'tenant' },
      { id: '507f1f77bcf86cd799439014', role: 'landlord' },
    ]) {
      const response = createResponse();
      await getOwnershipProof({ params: { id: propertyId }, user }, response);
      assert.equal(response.statusCode, 404);
      assert.equal(response.body.message, 'Ownership proof not found');
    }
  });
});

test('area admin may access only proofs within an assigned area', async () => {
  await withCloudinaryConfig(async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-type' ? 'image/png' : '1') },
      arrayBuffer: async () => Uint8Array.from([1]).buffer,
    });
    try {
      await withMocks(privateProperty(), async () => {
        const allowedResponse = createResponse();
        await getOwnershipProof({
          params: { id: propertyId },
          user: {
            id: '507f1f77bcf86cd799439015',
            role: 'admin',
            adminType: 'area',
            adminAreas: [{ city: 'Mekelle' }],
          },
        }, allowedResponse);
        assert.equal(allowedResponse.contentType, 'image/png');

        const deniedResponse = createResponse();
        await getOwnershipProof({
          params: { id: propertyId },
          user: {
            id: '507f1f77bcf86cd799439015',
            role: 'admin',
            adminType: 'area',
            adminAreas: [{ city: 'Addis Ababa' }],
          },
        }, deniedResponse);
        assert.equal(deniedResponse.statusCode, 404);
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('platform admin is authorized to access the proof', async () => {
  await withCloudinaryConfig(async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-type' ? 'image/png' : '1') },
      arrayBuffer: async () => Uint8Array.from([1]).buffer,
    });
    try {
      await withMocks(privateProperty(), async () => {
        const response = createResponse();
        await getOwnershipProof({
          params: { id: propertyId },
          user: {
            id: '507f1f77bcf86cd799439016',
            role: 'admin',
            adminType: 'platform',
            adminAreas: [],
          },
        }, response);
        assert.equal(response.contentType, 'image/png');
        assert.deepEqual([...response.body], [1]);
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('missing, invalid, and publicly delivered legacy proofs are never served', async () => {
  const invalidIdResponse = createResponse();
  await getOwnershipProof({
    params: { id: 'not-an-object-id' },
    user: { id: ownerId, role: 'landlord' },
  }, invalidIdResponse);
  assert.equal(invalidIdResponse.statusCode, 404);

  await withMocks(privateProperty({
    verificationDocumentAsset: undefined,
    verificationDocument: '',
  }), async () => {
    const missingResponse = createResponse();
    await getOwnershipProof({
      params: { id: propertyId },
      user: { id: ownerId, role: 'landlord' },
    }, missingResponse);
    assert.equal(missingResponse.statusCode, 404);
  });

  await withCloudinaryConfig(async () => withMocks(privateProperty({
    verificationDocumentAsset: undefined,
    verificationDocument: 'https://res.cloudinary.com/rentalverify-test/image/upload/v123/ownership/old-proof.png',
  }), async () => {
    const publicAssetResponse = createResponse();
    await getOwnershipProof({
      params: { id: propertyId },
      user: { id: ownerId, role: 'landlord' },
    }, publicAssetResponse);
    assert.equal(publicAssetResponse.statusCode, 409);
    assert.equal(publicAssetResponse.body.code, 'OWNERSHIP_PROOF_MIGRATION_REQUIRED');
  }));
});

test('Cloudinary rejecting an expired signed proof URL returns not found', async () => {
  await withCloudinaryConfig(async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 410,
      headers: { get: () => null },
    });
    try {
      await withMocks(privateProperty(), async () => {
        const response = createResponse();
        await getOwnershipProof(
          { params: { id: propertyId }, user: { id: ownerId, role: 'landlord' } },
          response,
        );
        assert.equal(response.statusCode, 404);
        assert.match(response.body.message, /expired/);
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
