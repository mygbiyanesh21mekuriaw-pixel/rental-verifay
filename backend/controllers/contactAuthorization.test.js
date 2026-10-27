const test = require('node:test');
const assert = require('node:assert/strict');
const ContactMessage = require('../models/ContactMessage');
const {
  getAreaAdminContactMessages,
  markAreaAdminContactMessageRead,
} = require('./contactController');

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

test('area admins only load contact messages assigned to their area', async () => {
  const originalFind = ContactMessage.find;
  let filter;
  ContactMessage.find = (query) => {
    filter = query;
    return { sort: () => ({ lean: async () => [] }) };
  };
  const response = createResponse();

  try {
    await getAreaAdminContactMessages({
      user: { role: 'admin', adminType: 'area', assignedArea: 'North' },
    }, response);

    assert.equal(filter.$or[0].areaKey, 'north');
    assert.equal(filter.$or[1].area.test('North'), true);
    assert.equal(filter.$or[1].area.test('South'), false);
    assert.deepEqual(response.body, []);
  } finally {
    ContactMessage.find = originalFind;
  }
});

test('area admins cannot mark another area contact message as read', async () => {
  const originalFindOneAndUpdate = ContactMessage.findOneAndUpdate;
  let filter;
  ContactMessage.findOneAndUpdate = async (query) => {
    filter = query;
    return null;
  };
  const response = createResponse();

  try {
    await markAreaAdminContactMessageRead({
      params: { id: '507f1f77bcf86cd799439011' },
      user: { role: 'admin', adminType: 'area', assignedArea: 'North' },
    }, response);

    assert.equal(filter._id, '507f1f77bcf86cd799439011');
    assert.equal(filter.$or[0].areaKey, 'north');
    assert.equal(filter.$or[1].area.test('North'), true);
    assert.equal(filter.$or[1].area.test('South'), false);
    assert.equal(response.statusCode, 404);
  } finally {
    ContactMessage.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('Platform Admin cannot load the Area Admin contact inbox', async () => {
  const originalFind = ContactMessage.find;
  let findCalled = false;
  ContactMessage.find = () => { findCalled = true; throw new Error('Area Admin inbox must reject Platform Admins'); };
  const response = createResponse();

  try {
    await getAreaAdminContactMessages({
      user: { role: 'admin', adminType: 'platform' },
    }, response);
    assert.deepEqual(response.body, []);
    assert.equal(findCalled, false);
  } finally {
    ContactMessage.find = originalFind;
  }
});
