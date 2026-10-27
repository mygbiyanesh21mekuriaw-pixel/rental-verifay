const Property = require('../models/Property');
const VerificationRequest = require('../models/VerificationRequest');
const RentalRequest = require('../models/RentalRequest');
const ContactMessage = require('../models/ContactMessage');
const Notification = require('../models/Notification');
const { buildAdminAreaQuery } = require('./adminArea');

const getAreaName = (area) => {
  if (typeof area === 'string') return area.trim();
  if (!area || typeof area !== 'object') return '';
  return ['city', 'region', 'zone', 'wereda', 'subCity']
    .map((field) => String(area[field] || '').trim())
    .find(Boolean) || '';
};

const getAdminAreaNames = (admin) => {
  const assignedArea = String(admin?.assignedArea || '').trim();
  if (assignedArea) return [assignedArea];
  return [...new Set((admin?.adminAreas || []).map(getAreaName).filter(Boolean))];
};

const clearUnfinishedAreaAdminAssignments = async (admin) => {
  const areaNames = getAdminAreaNames(admin);
  if (!admin?._id || areaNames.length === 0) return;

  const adminIds = [admin._id, String(admin._id)];
  const assignmentFilter = {
    $or: [
      { assignedTo: { $in: adminIds } },
      { ownerAdminId: { $in: adminIds } },
    ],
  };
  const areaFilter = buildAdminAreaQuery(areaNames);
  const areaProperties = await Property.find(areaFilter).select('_id').lean();
  const propertyIds = areaProperties.map((property) => property._id);
  const unsetAssignment = { $unset: { assignedTo: 1, ownerAdminId: 1 } };
  const updateOptions = { strict: false };
  const updates = [
    Property.updateMany(
      {
        isVerified: false,
        verificationStatus: 'pending',
        $and: [areaFilter, assignmentFilter],
      },
      unsetAssignment,
      updateOptions,
    ),
    ContactMessage.updateMany(
      {
        $and: [
          buildAdminAreaQuery(areaNames),
          assignmentFilter,
        ],
        read: false,
      },
      unsetAssignment,
      updateOptions,
    ),
  ];

  if (propertyIds.length > 0) {
    updates.push(
      VerificationRequest.updateMany(
        { property: { $in: propertyIds }, status: 'pending', ...assignmentFilter },
        unsetAssignment,
        updateOptions,
      ),
      RentalRequest.updateMany(
        { property: { $in: propertyIds }, status: 'pending', ...assignmentFilter },
        unsetAssignment,
        updateOptions,
      ),
      Notification.updateMany(
        { property: { $in: propertyIds }, recipientRole: 'admin', read: false, ...assignmentFilter },
        unsetAssignment,
        updateOptions,
      ),
    );
  }

  await Promise.all(updates);
};

module.exports = { clearUnfinishedAreaAdminAssignments, getAdminAreaNames };