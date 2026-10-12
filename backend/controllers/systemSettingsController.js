const SystemSettings = require('../models/SystemSettings');

const supportedLanguages = ['en', 'am', 'om', 'ti', 'sid'];
const supportedAppearances = ['light', 'dark', 'system'];
const defaultSettings = {
  defaultLanguage: 'en',
  defaultAppearance: 'system',
  notifications: {
    inAppEnabled: true,
    emailEnabled: true,
  },
};

const serializeSettings = (settings) => ({
  defaultLanguage: settings?.defaultLanguage || defaultSettings.defaultLanguage,
  defaultAppearance: settings?.defaultAppearance || defaultSettings.defaultAppearance,
  notifications: {
    inAppEnabled: settings?.notifications?.inAppEnabled ?? defaultSettings.notifications.inAppEnabled,
    emailEnabled: settings?.notifications?.emailEnabled ?? defaultSettings.notifications.emailEnabled,
  },
});

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

const updateSystemSettings = async (req, res) => {
  const { defaultLanguage, defaultAppearance, notifications } = req.body || {};
  if (
    !supportedLanguages.includes(defaultLanguage) ||
    !supportedAppearances.includes(defaultAppearance) ||
    !notifications ||
    typeof notifications.inAppEnabled !== 'boolean' ||
    typeof notifications.emailEnabled !== 'boolean'
  ) {
    return res.status(400).json({ message: 'System settings contain invalid values.' });
  }

  try {
    const settings = await SystemSettings.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          defaultLanguage,
          defaultAppearance,
          notifications: {
            inAppEnabled: notifications.inAppEnabled,
            emailEnabled: notifications.emailEnabled,
          },
          updatedBy: req.user.id,
        },
        $setOnInsert: { key: 'global' },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
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

module.exports = { getSystemSettings, updateSystemSettings };
