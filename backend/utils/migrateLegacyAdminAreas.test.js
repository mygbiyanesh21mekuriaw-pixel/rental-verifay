const test = require('node:test');
const assert = require('node:assert/strict');
const Area = require('../models/Area');
const User = require('../models/User');
const Property = require('../models/Property');
const migrateLegacyAdminAreas = require('./migrateLegacyAdminAreas');

test('legacy area-admin migration preserves platform admins and canonicalizes assigned areas', async () => {
  const originalUserFind = User.find;
  const originalUserUpdateOne = User.updateOne;
  const originalAreaUpdateOne = Area.updateOne;
  const originalAreaFindOne = Area.findOne;
  const originalAreaFind = Area.find;
  const originalPropertyUpdateMany = Property.updateMany;
  let adminFilter;
  const areaUpdates = [];
  let userUpdate;

  User.find = (filter) => {
    adminFilter = filter;
    return {
      select: () => ({
        lean: async () => [{
          _id: 'legacy-admin',
          assignedArea: 'north ridge',
          adminAreas: [{ city: 'north ridge' }],
        }],
      }),
    };
  };
  Area.updateOne = async (filter, update) => { areaUpdates.push({ filter, update }); };
  Area.findOne = () => ({
    select: () => ({ lean: async () => ({ name: 'North Ridge' }) }),
  });
  User.updateOne = async (filter, update) => { userUpdate = { filter, update }; };
  Area.find = () => ({
    select: () => ({ lean: async () => [] }),
  });
  Property.updateMany = async () => {};

  try {
    await migrateLegacyAdminAreas();

    assert.deepEqual(adminFilter.$or[1], { 'adminAreas.0': { $exists: true } });
    assert.deepEqual(areaUpdates, [{
      filter: { normalizedName: 'north ridge' },
      update: { $set: { name: 'North Ridge', normalizedName: 'north ridge' } },
    }]);
    assert.deepEqual(userUpdate, {
      filter: { _id: 'legacy-admin' },
      update: {
        $set: {
          adminType: 'area',
          assignedArea: 'North Ridge',
          adminAreas: [{ city: 'North Ridge' }],
        },
      },
    });
  } finally {
    User.find = originalUserFind;
    User.updateOne = originalUserUpdateOne;
    Area.updateOne = originalAreaUpdateOne;
    Area.findOne = originalAreaFindOne;
    Area.find = originalAreaFind;
    Property.updateMany = originalPropertyUpdateMany;
  }
});
