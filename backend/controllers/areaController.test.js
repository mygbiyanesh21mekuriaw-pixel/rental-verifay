const test = require('node:test');
const assert = require('node:assert/strict');
const Area = require('../models/Area');
const User = require('../models/User');
const Property = require('../models/Property');
const RentalRequest = require('../models/RentalRequest');
const ContactMessage = require('../models/ContactMessage');
const areaRoutes = require('../routes/areaRoutes');
const { deleteArea, getAreas } = require('./areaController');

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

test('all Area CRUD routes follow authentication and platform-admin middleware', () => {
  assert.equal(areaRoutes.stack[0].name, 'auth');
  assert.equal(typeof areaRoutes.stack[1].handle, 'function');
  assert.deepEqual(
    areaRoutes.stack
      .filter((layer) => layer.route)
      .map((layer) => [Object.keys(layer.route.methods)[0], layer.route.path]),
    [
      ['get', '/'],
      ['post', '/'],
      ['put', '/:id'],
      ['delete', '/:id'],
    ],
  );
});

test('deleting a place assigned to an admin is rejected', async () => {
  const originalFindById = Area.findById;
  const originalExists = User.exists;
  let checkedAdminFilter;
  Area.findById = () => ({
    select: async () => ({ name: 'North' }),
  });
  User.exists = async (filter) => {
    checkedAdminFilter = filter;
    return { _id: 'assigned-admin' };
  };
  const response = createResponse();

  try {
    await deleteArea({ params: { id: '507f1f77bcf86cd799439011' } }, response);

    assert.equal(response.statusCode, 409);
    assert.match(response.body.message, /assigned to an admin/);
    assert.equal(checkedAdminFilter.role, 'admin');
    assert.ok(checkedAdminFilter.$and[1].$or.some((condition) => condition.assignedArea instanceof RegExp));
  } finally {
    Area.findById = originalFindById;
    User.exists = originalExists;
  }
});

test('area list counts active admins and waiting items independently for each area', async () => {
  const originals = {
    areaFind: Area.find,
    propertyFind: Property.find,
    propertyCount: Property.countDocuments,
    rentalCount: RentalRequest.countDocuments,
    contactCount: ContactMessage.countDocuments,
    userCount: User.countDocuments,
  };
  const areas = [
    { _id: 'bahirdar-id', name: 'Bahirdar', region: 'Amhara' },
    { _id: 'dessie-id', name: 'Dessie', region: 'Amhara' },
    { _id: 'gimba-id', name: 'Gimba', region: 'Amhara' },
  ];
  const propertyIdsByArea = {
    Bahirdar: ['bahirdar-property'],
    Dessie: ['dessie-property'],
    Gimba: ['gimba-property'],
  };
  const activeAdminsByArea = { Bahirdar: 1, Dessie: 0, Gimba: 1 };
  const pendingPropertiesByArea = { Bahirdar: 1, Dessie: 1, Gimba: 0 };
  const pendingRentalRequestsByArea = { Bahirdar: 2, Dessie: 2, Gimba: 1 };
  const unreadMessagesByArea = { Bahirdar: 3, Dessie: 1, Gimba: 2 };
  Area.find = () => ({
    select: () => ({
      sort: () => ({ lean: async () => areas }),
    }),
  });
  const queryMatchesArea = (value, name) => {
    if (value instanceof RegExp) return value.test(name);
    if (!value || typeof value !== 'object') return false;
    return Object.values(value).some((child) => queryMatchesArea(child, name));
  };
  const getAreaFromFilter = (filter) => areas.find((area) => queryMatchesArea(filter, area.name))?.name;
  Property.find = (filter) => ({
    select: () => ({
      lean: async () => {
        const areaName = getAreaFromFilter(filter);
        return (propertyIdsByArea[areaName] || []).map((_id) => ({ _id }));
      },
    }),
  });
  Property.countDocuments = async (filter) => pendingPropertiesByArea[getAreaFromFilter(filter)] || 0;
  RentalRequest.countDocuments = async (filter) => {
    const areaName = Object.entries(propertyIdsByArea)
      .find(([, propertyIds]) => propertyIds.some((id) => filter.property.$in.includes(id)))?.[0];
    return pendingRentalRequestsByArea[areaName] || 0;
  };
  ContactMessage.countDocuments = async (filter) => {
    const areaName = areas.find(({ name }) => filter.area.test(name))?.name;
    return unreadMessagesByArea[areaName] || 0;
  };
  User.countDocuments = async (filter) => {
    assert.equal(filter.isActive.$ne, false);
    const assignedAreaPatterns = filter.$and[1].$or
      .map((condition) => condition.assignedArea)
      .filter((value) => value instanceof RegExp);
    assert.equal(assignedAreaPatterns.length, 1);
    const legacyAreaMatch = filter.$and[1].$or.find((condition) => Array.isArray(condition.$and));
    assert.deepEqual(legacyAreaMatch.$and[0].$or, [
      { assignedArea: { $exists: false } },
      { assignedArea: '' },
      { assignedArea: null },
    ]);
    const [area] = areas.filter(({ name }) => assignedAreaPatterns[0].test(name));
    return activeAdminsByArea[area?.name] || 0;
  };
  const response = createResponse();

  try {
    await getAreas({}, response);
    assert.equal(response.statusCode, null);
    assert.deepEqual(response.body.map(({ name, activeAdminCount, waitingItemCount, hasNoActiveAdminWithWaitingItems }) => ({
      name,
      activeAdminCount,
      waitingItemCount,
      hasNoActiveAdminWithWaitingItems,
    })), [
      { name: 'Bahirdar', activeAdminCount: 1, waitingItemCount: 6, hasNoActiveAdminWithWaitingItems: false },
      { name: 'Dessie', activeAdminCount: 0, waitingItemCount: 4, hasNoActiveAdminWithWaitingItems: true },
      { name: 'Gimba', activeAdminCount: 1, waitingItemCount: 3, hasNoActiveAdminWithWaitingItems: false },
    ]);
  } finally {
    Area.find = originals.areaFind;
    Property.find = originals.propertyFind;
    Property.countDocuments = originals.propertyCount;
    RentalRequest.countDocuments = originals.rentalCount;
    ContactMessage.countDocuments = originals.contactCount;
    User.countDocuments = originals.userCount;
  }
});
