const test = require('node:test');
const assert = require('node:assert/strict');
const ContactMessage = require('../models/ContactMessage');
const { getPlatformContactMessages, markContactMessageRead } = require('./contactController');

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
    await getPlatformContactMessages({
      user: { role: 'admin', adminType: 'area', assignedArea: 'North' },
    }, response);

    assert.deepEqual(filter, { area: 'North' });
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
    await markContactMessageRead({
      params: { id: '507f1f77bcf86cd799439011' },
      user: { role: 'admin', adminType: 'area', assignedArea: 'North' },
    }, response);

    assert.deepEqual(filter, { _id: '507f1f77bcf86cd799439011', area: 'North' });
    assert.equal(response.statusCode, 404);
  } finally {
    ContactMessage.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
