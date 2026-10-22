const SystemSettings = require('../models/SystemSettings');

const supportedAppearances = ['light', 'dark', 'system'];
const defaultSettings = {
  defaultAppearance: 'system',
  notifications: {
    inAppEnabled: true,
    emailEnabled: true,
  },
  general: {
    websiteName: 'House Rental Management System',
    websiteLogoDataUri: '',
    contactEmail: '',
    contactPhone: '',
    contactAddress: '',
  },
  properties: {
    submissionsEnabled: true,
    requireAdminReview: true,
  },
  maintenance: {
    enabled: false,
    message: 'RentalVerify is temporarily unavailable for scheduled maintenance. Please check back soon.',
  },
};

const serializeSettings = (settings) => ({
  defaultAppearance: settings?.defaultAppearance || defaultSettings.defaultAppearance,
  notifications: {
    inAppEnabled: settings?.notifications?.inAppEnabled ?? defaultSettings.notifications.inAppEnabled,
    emailEnabled: settings?.notifications?.emailEnabled ?? defaultSettings.notifications.emailEnabled,
  },
  general: {
    ...defaultSettings.general,
    ...(settings?.general || {}),
  },
  properties: {
    ...defaultSettings.properties,
    ...(settings?.properties || {}),
  },
  maintenance: {
    ...defaultSettings.maintenance,
    ...(settings?.maintenance || {}),
  },
});

const serializePublicStatus = (settings) => ({
  maintenance: {
    enabled: settings?.maintenance?.enabled ?? defaultSettings.maintenance.enabled,
    message: settings?.maintenance?.message || defaultSettings.maintenance.message,
  },
  branding: {
    websiteName: settings?.general?.websiteName || defaultSettings.general.websiteName,
    websiteLogoDataUri: settings?.general?.websiteLogoDataUri || '',
    contactEmail: settings?.general?.contactEmail || '',
    contactPhone: settings?.general?.contactPhone || '',
    contactAddress: settings?.general?.contactAddress || '',
  },
});

const validGeneral = (general) => {
  if (general === undefined) return true;
  if (!general || typeof general !== 'object' || Array.isArray(general)) return false;
  const { websiteName, contactEmail, contactPhone, contactAddress } = general;
  return (websiteName === undefined || (
    typeof websiteName === 'string' &&
    websiteName.trim().length > 0 &&
    websiteName.trim().length <= 100
  )) &&
    (contactEmail === undefined || (
      typeof contactEmail === 'string' &&
      contactEmail.length <= 254 &&
      (!contactEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()))
    )) &&
    (contactPhone === undefined || (
      typeof contactPhone === 'string' &&
      contactPhone.length <= 30 &&
      /^[+()\d\s.-]*$/.test(contactPhone)
    )) &&
    (contactAddress === undefined || (
      typeof contactAddress === 'string' &&
      contactAddress.length <= 500
    ));
};

const validBooleanGroup = (group, keys) =>
  group === undefined || (
    group &&
    typeof group === 'object' &&
    !Array.isArray(group) &&
    keys.every((key) => group[key] === undefined || typeof group[key] === 'boolean')
  );

const getSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne({ key: 'global' }).lean();
    if (!settings) {
      try {
        settings = await SystemSettings.create({ key: 'global' });
      } catch (createError) {
        if (createError?.code !== 11000) throw createError;
        settings = await SystemSettings.findOne({ key: 'global' }).lean();
      }
    }
    if (!settings) {
      throw new Error('Global system settings could not be initialized.');
    }
    return res.json({ settings: serializeSettings(settings) });
  } catch (error) {
    console.error('Unable to load system settings:', error);
    return res.status(500).json({ message: 'Unable to load system settings.' });
  }
};

const getPublicSystemStatus = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne({ key: 'global' }).select('general.websiteName general.websiteLogoDataUri maintenance').lean();
    return res.json(serializePublicStatus(settings));
  } catch (error) {
    console.error('Unable to load public system status:', error);
    return res.status(500).json({ message: 'Unable to load system status.' });
  }
};

const updateSystemSettings = async (req, res) => {
  const {
    defaultAppearance,
    notifications,
    general,
    properties,
    maintenance,
  } = req.body || {};
  if (
    (defaultAppearance !== undefined && !supportedAppearances.includes(defaultAppearance)) ||
    !validBooleanGroup(notifications, ['inAppEnabled', 'emailEnabled']) ||
    !validGeneral(general) ||
    !validBooleanGroup(properties, ['submissionsEnabled', 'requireAdminReview']) ||
    !validBooleanGroup(maintenance, ['enabled']) ||
    (maintenance?.message !== undefined && (
      typeof maintenance.message !== 'string' ||
      maintenance.message.trim().length === 0 ||
      maintenance.message.trim().length > 500
    ))
  ) {
    return res.status(400).json({ message: 'System settings contain invalid values.' });
  }
  const updates = { updatedBy: req.user.id };
  if (defaultAppearance !== undefined) updates.defaultAppearance = defaultAppearance;
  if (notifications) {
    for (const key of ['inAppEnabled', 'emailEnabled']) {
      if (notifications[key] !== undefined) updates[`notifications.${key}`] = notifications[key];
    }
  }
  if (general) {
    for (const key of ['websiteName', 'contactEmail', 'contactPhone', 'contactAddress']) {
      if (general[key] !== undefined) {
        updates[`general.${key}`] = key === 'contactEmail'
          ? general[key].trim().toLowerCase()
          : general[key].trim();
      }
    }
  }
  if (properties) {
    for (const key of ['submissionsEnabled', 'requireAdminReview']) {
      if (properties[key] !== undefined) updates[`properties.${key}`] = properties[key];
    }
  }
  if (maintenance) {
    if (maintenance.enabled !== undefined) updates['maintenance.enabled'] = maintenance.enabled;
    if (maintenance.message !== undefined) updates['maintenance.message'] = maintenance.message.trim();
  }

  try {
    const settings = await SystemSettings.findOneAndUpdate(
      { key: 'global' },
      {
        $set: updates,
        $setOnInsert: { key: 'global' },
      },
      { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json({
      message: 'System settings saved.',
      settings: serializeSettings(settings),
    });
  } catch (error) {
    console.error('Unable to save system settings:', error);
    return res.status(500).json({ message: 'Unable to save system settings.' });
  }
};

const getImageType = (buffer) => {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

const uploadWebsiteLogo = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Select a PNG, JPG, or WEBP logo file.' });
  const actualMimeType = getImageType(req.file.buffer);
  if (!actualMimeType || actualMimeType !== req.file.mimetype) {
    return res.status(400).json({ message: 'The uploaded logo must be a valid PNG, JPG, or WEBP image.' });
  }

  try {
    const websiteLogoDataUri = `data:${actualMimeType};base64,${req.file.buffer.toString('base64')}`;
    const settings = await SystemSettings.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          'general.websiteLogoDataUri': websiteLogoDataUri,
          updatedBy: req.user.id,
        },
        $setOnInsert: { key: 'global' },
      },
      { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json({
      message: 'Website logo updated.',
      settings: serializeSettings(settings),
      status: serializePublicStatus(settings),
    });
  } catch (error) {
    console.error('Unable to save website logo:', error);
    return res.status(500).json({ message: 'Unable to save website logo.' });
  }
};

module.exports = {
  getSystemSettings,
  getPublicSystemStatus,
  updateSystemSettings,
  uploadWebsiteLogo,
  serializeSettings,
  serializePublicStatus,
  defaultSettings,
};
