const test = require('node:test');
const assert = require('node:assert/strict');
const Area = require('../models/Area');
const User = require('../models/User');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const ContactMessage = require('../models/ContactMessage');
const SystemLog = require('../models/SystemLog');
const areaRoutes = require('../routes/areaRoutes');
const publicAreaRoutes = require('../routes/publicAreaRoutes');
const {
  addressRulesOverlap,
  createArea,
  deleteArea,
  getAreas,
  getPublicAreas,
  getUnassignedProperties,
  assignMappedUnassignedProperties,
  setAreaActive,
  updateArea,
} = require('./areaController');

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const queryFor = (value) => ({
  select() { return this; },
  sort() { return this; },
  lean() { return Promise.resolve(value); },
});

const findByIdQueryFor = (value) => ({
  select: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

const withMocks = async (replacements, callback) => {
  const originals = Object.fromEntries(Object.keys(replacements).map((key) => {
    const [modelName, method] = key.split('.');
    return [key, { model: { Area, User, Property, RentalRequest, ContactMessage, SystemLog }[modelName], method,
      value: { Area, User, Property, RentalRequest, ContactMessage, SystemLog }[modelName][method] }];
  }));
  Object.entries(replacements).forEach(([key, value]) => {
    const [modelName, method] = key.split('.');
    ({ Area, User, Property, RentalRequest, ContactMessage, SystemLog }[modelName])[method] = value;
  });
  try {
    await callback();
  } finally {
    Object.values(originals).forEach(({ model, method, value }) => {
      model[method] = value;
    });
  }
};

test('all Area CRUD routes require authentication and platform-admin access', () => {
  assert.equal(areaRoutes.stack[0].name, 'auth');
  assert.equal(typeof areaRoutes.stack[1].handle, 'function');
  assert.deepEqual(
    areaRoutes.stack.filter((layer) => layer.route).map((layer) => [
      Object.keys(layer.route.methods)[0],
      layer.route.path,
    ]),
    [
      ['get', '/unassigned-properties'],
      ['get', '/'],
      ['post', '/'],
      ['put', '/:id'],
      ['patch', '/:id/status'],
      ['delete', '/:id'],
    ],
  );
  assert.equal(publicAreaRoutes.stack[0].route.path, '/');
});

test('area management rejects non-platform-admin requests with 403', () => {
  const platformAdminGuard = areaRoutes.stack[1].handle;
  const response = createResponse();
  let nextCalled = false;
  platformAdminGuard(
    { user: { role: 'admin', adminType: 'area' } },
    response,
    () => { nextCalled = true; },
  );
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('address mapping overlap detects wildcard, exact and conflicting values case-insensitively', () => {
  assert.equal(addressRulesOverlap({ city: 'Dessie' }, { region: 'Amhara', city: 'dessie' }), true);
  assert.equal(addressRulesOverlap({ region: 'Amhara' }, { region: 'Oromia' }), false);
  assert.equal(addressRulesOverlap({ region: 'Amhara', city: 'Dessie' }, { region: 'Amhara', city: 'Adama' }), false);
  assert.equal(addressRulesOverlap({ city: 'Dessie' }, {}), false);
});

test('area creation requires a matching rule and reports the active area that conflicts', async () => {
  const activeArea = {
    _id: 'area-1',
    name: 'North Wollo',
    addressMapping: { region: 'Amhara', zone: 'North Wollo', wereda: '', city: '' },
  };
  await withMocks({
    'Area.findOne': () => ({ select: () => ({ lean: async () => null }) }),
    'Area.find': () => queryFor([activeArea]),
  }, async () => {
    const missingRuleResponse = createResponse();
    await createArea({
      body: { name: 'Dessie', region: 'Amhara', addressMapping: {} },
    }, missingRuleResponse);
    assert.equal(missingRuleResponse.statusCode, 400);
    assert.equal(missingRuleResponse.body.message, 'At least one address matching rule is required.');

    const conflictResponse = createResponse();
    await createArea({
      body: {
        name: 'Dessie',
        region: 'Amhara',
        addressMapping: { region: 'amhara', zone: 'NORTH WOLLO', city: '' },
      },
    }, conflictResponse);
    assert.equal(conflictResponse.statusCode, 409);
    assert.equal(conflictResponse.body.conflictingArea, 'North Wollo');
    assert.match(conflictResponse.body.message, /overlap/);
  });
});

test('area creation checks name uniqueness without case sensitivity', async () => {
  let nameQuery;
  await withMocks({
    'Area.findOne': (filter) => {
      nameQuery = filter;
      return { select: () => ({ lean: async () => ({ name: 'Bahirdar' }) }) };
    },
  }, async () => {
    const response = createResponse();
    await createArea({
      body: {
        name: 'BAHIRDAR',
        addressMapping: { city: 'Bahir Dar' },
      },
    }, response);
    assert.equal(response.statusCode, 409);
    assert.deepEqual(nameQuery, { normalizedName: 'bahirdar' });
    assert.equal(response.body.message, 'A place with that name already exists.');
  });
});

test('area updates reject matching rules that overlap another active area', async () => {
  const area = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Dessie',
    addressMapping: { city: 'Dessie' },
    save: async () => assert.fail('Conflicting rule updates must not be saved.'),
  };
  await withMocks({
    'Area.findById': () => findByIdQueryFor(area),
    'Area.findOne': () => ({ select: () => ({ lean: async () => null }) }),
    'Area.find': () => queryFor([{
      _id: 'another-area',
      name: 'North Wollo',
      addressMapping: { region: 'Amhara', city: 'Dessie' },
    }]),
  }, async () => {
    const response = createResponse();
    await updateArea({
      params: { id: area._id },
      body: { name: 'Dessie', region: 'Amhara', addressMapping: { city: 'Dessie' } },
    }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.conflictingArea, 'North Wollo');
  });
});

test('area list returns admin, property counts and summary totals', async () => {
  const areas = [
    { _id: 'a1', name: 'Bahirdar', region: 'Amhara', addressMapping: { city: 'Bahir Dar' }, isActive: true },
    { _id: 'a2', name: 'Dessie', region: 'Amhara', addressMapping: { city: 'Dessie' }, isActive: true },
  ];
  await withMocks({
    'Area.find': () => queryFor(areas),
    'Property.find': (filter) => queryFor(filter.$or?.some((condition) => (
      condition.areaKey === 'bahirdar' || condition.area?.test('Bahirdar')
    ))
      ? [{ _id: 'property-1' }, { _id: 'property-2' }]
      : []),
    'Property.countDocuments': async (filter) => {
      if (filter.area === 'Unassigned area') return 4;
      return filter.verificationStatus === 'pending' ? 1 : 2;
    },
    'RentalRequest.countDocuments': async () => 2,
    'ContactMessage.countDocuments': async (filter) => filter.read === false ? 1 : 0,
    'User.countDocuments': async (filter) => filter.isActive
      ? (filter.$and[1].$or[0].assignedAreaKey === 'bahirdar' ? 1 : 0)
      : 0,
    'User.findOne': () => queryFor({ name: 'Bahir Admin', status: 'active' }),
  }, async () => {
    const response = createResponse();
    await getAreas({ query: { includeSummary: 'true' } }, response);
    assert.equal(response.statusCode, null);
    assert.equal(response.body.totals.totalAreas, 2);
    assert.equal(response.body.totals.areasWithAdmin, 1);
    assert.equal(response.body.totals.areasWithoutAdmin, 1);
    assert.equal(response.body.totals.unassignedProperties, 4);
    assert.deepEqual(response.body.areas.map((area) => ({
      name: area.name,
      areaAdmin: area.areaAdmin,
      propertyCount: area.propertyCount,
      waitingPropertyCount: area.waitingPropertyCount,
    })), [
      { name: 'Bahirdar', areaAdmin: { name: 'Bahir Admin', status: 'active', isActive: true }, propertyCount: 2, waitingPropertyCount: 1 },
      { name: 'Dessie', areaAdmin: null, propertyCount: 0, waitingPropertyCount: 1 },
    ]);
  });
});

test('public area choices and new address matching exclude disabled areas', async () => {
  const activeArea = { name: 'Active', addressMapping: { city: 'Dessie' } };
  await withMocks({
    'Area.find': (filter) => {
      assert.deepEqual(filter, { isActive: { $ne: false } });
      return queryFor([activeArea]);
    },
    'Property.find': (filter) => {
      assert.deepEqual(filter, { area: 'Unassigned area' });
      return {
        select: () => ({
          lean: async () => [{ _id: 'p1', city: 'Dessie' }],
        }),
      };
    },
    'Property.updateOne': async (_filter, update) => {
      assert.deepEqual(update, { $set: { area: 'Active', areaKey: 'active' } });
      return { modifiedCount: 1 };
    },
  }, async () => {
    const publicResponse = createResponse();
    await getPublicAreas({}, publicResponse);
    assert.deepEqual(publicResponse.body, [activeArea]);
    await assignMappedUnassignedProperties();
  });
});

test('deletion is blocked with property records and returns counts plus disable guidance', async () => {
  const area = { _id: '507f1f77bcf86cd799439011', name: 'North' };
  await withMocks({
    'Area.findById': () => findByIdQueryFor(area),
    'Property.find': () => ({
      select: () => ({ lean: async () => [{ _id: 'p1' }, { _id: 'p2' }] }),
    }),
    'Property.countDocuments': async () => 2,
    'User.countDocuments': async () => 0,
    'RentalRequest.countDocuments': async () => 0,
    'ContactMessage.countDocuments': async () => 0,
  }, async () => {
    const response = createResponse();
    await deleteArea({ params: { id: area._id } }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.counts.properties, 2);
    assert.equal(response.body.counts.areaAdmins, 0);
    assert.equal(response.body.suggestion, 'Disable this area instead.');
  });
});

test('deletion is blocked by area history even when it has no properties or admins', async () => {
  const area = { _id: '507f1f77bcf86cd799439011', name: 'North' };
  await withMocks({
    'Area.findById': () => findByIdQueryFor(area),
    'Property.find': () => ({
      select: () => ({ lean: async () => [] }),
    }),
    'Property.countDocuments': async () => 0,
    'User.countDocuments': async () => 0,
    'RentalRequest.countDocuments': async () => 0,
    'ContactMessage.countDocuments': async () => 3,
  }, async () => {
    const response = createResponse();
    await deleteArea({ params: { id: area._id } }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.counts.history, 3);
  });
});

test('deletion is blocked when an inactive Area Admin remains assigned', async () => {
  const area = { _id: '507f1f77bcf86cd799439011', name: 'North' };
  await withMocks({
    'Area.findById': () => findByIdQueryFor(area),
    'Property.find': () => ({ select: () => ({ lean: async () => [] }) }),
    'Property.countDocuments': async () => 0,
    'User.countDocuments': async () => 1,
    'RentalRequest.countDocuments': async () => 0,
    'ContactMessage.countDocuments': async () => 0,
  }, async () => {
    const response = createResponse();
    await deleteArea({ params: { id: area._id } }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.counts.areaAdmins, 1);
  });
});

test('deletion logs the area action and removes only an unused area', async () => {
  let deleted = false;
  let auditRecord;
  const area = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Unused',
    deleteOne: async () => { deleted = true; },
  };
  await withMocks({
    'Area.findById': () => findByIdQueryFor(area),
    'Property.find': () => ({ select: () => ({ lean: async () => [] }) }),
    'Property.countDocuments': async () => 0,
    'User.countDocuments': async () => 0,
    'RentalRequest.countDocuments': async () => 0,
    'ContactMessage.countDocuments': async () => 0,
    'SystemLog.create': async (entry) => { auditRecord = entry; return entry; },
  }, async () => {
    const response = createResponse();
    await deleteArea({
      params: { id: area._id },
      user: { _id: 'admin-id', name: 'Platform Admin', email: 'admin@example.test', role: 'admin', adminType: 'platform' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(deleted, true);
    assert.equal(auditRecord.action, 'AREA_DELETED');
    assert.equal(auditRecord.targetType, 'area');
  });
});

test('disabling an area preserves it and writes an audit event', async () => {
  let auditRecord;
  let saveCount = 0;
  const area = {
    _id: '507f1f77bcf86cd799439011',
    name: 'North',
    addressMapping: { city: 'Dessie' },
    isActive: true,
    save: async () => { saveCount += 1; },
  };
  await withMocks({
    'Area.findById': () => findByIdQueryFor(area),
    'SystemLog.create': async (entry) => { auditRecord = entry; return entry; },
  }, async () => {
    const response = createResponse();
    await setAreaActive({
      params: { id: area._id },
      body: { isActive: false },
      user: { _id: 'admin-id', name: 'Platform Admin', email: 'admin@example.test', role: 'admin', adminType: 'platform' },
    }, response);
    assert.equal(response.statusCode, null);
    assert.equal(area.isActive, false);
    assert.equal(saveCount, 1);
    assert.equal(auditRecord.action, 'AREA_DISABLED');
  });
});

test('unassigned property warning list returns only records without a derived area', async () => {
  const properties = [{ _id: 'unassigned-id', title: 'Unmapped home', area: 'Unassigned area' }];
  await withMocks({
    'Property.find': (filter) => {
      assert.deepEqual(filter, { area: 'Unassigned area' });
      return {
        select: () => ({ sort: () => ({ lean: async () => properties }) }),
      };
    },
  }, async () => {
    const response = createResponse();
    await getUnassignedProperties({}, response);
    assert.deepEqual(response.body, properties);
  });
});
