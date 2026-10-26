const User = require('../models/User');
const Area = require('../models/Area');
const SystemSettings = require('../models/SystemSettings');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logAudit } = require('../utils/auditLogger');
const { decryptBankAccountNumber } = require('../utils/bankAccountCrypto');
const maskBankAccountNumber = require('../utils/maskBankAccountNumber');
const sendEmail = require('../utils/email');
const { uploadFilesToUrls } = require('../utils/uploadMedia');
const { ensureUserPermissions, getUserPermissions } = require('../services/userPermissions');
const { permissionRoleForUser } = require('../config/permissionCatalog');

const registrationNamePattern = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
const registrationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const registrationPhonePattern = /^(?:0[79]\d{8}|\+251[79]\d{8})$/;
const usernamePattern = /^[a-z0-9_]{3,20}$/;

const normalizeLoginEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return normalizedEmail.replace(/@rentalverifay\.com$/i, '@rentalverify.com');
};

const normalizeAccountEmail = (email) => normalizeLoginEmail(email);

const serializeUser = (user) => {
  const isLandlord = user.role === 'landlord';
  let bankAccountNumber = '';
  let bankAccountNeedsUpdate = false;

  if (isLandlord && user.bankAccountNumber) {
    try {
      bankAccountNumber = decryptBankAccountNumber(user.bankAccountNumber);
    } catch (error) {
      bankAccountNeedsUpdate = true;
      console.error('[BANK ACCOUNT] Stored account number cannot be decrypted; the landlord must enter it again.');
    }
  }

  return {
    id: user._id ? user._id.toString() : user.id,
    name: user.name,
    email: user.email,
    username: user.username || undefined,
    phone: user.phone || '',
    profilePhoto: user.profilePhoto || '',
    role: user.role,
    status: user.status || 'active',
    mustChangePassword: user.mustChangePassword === true,
    area: user.area || '',
    adminType: user.role === 'admin'
      ? user.adminType || (user.adminAreas?.length ? 'area' : 'platform')
      : undefined,
    assignedArea: user.role === 'admin'
      ? user.assignedArea || ''
      : undefined,
    adminAreas: user.role === 'admin' ? user.adminAreas || [] : undefined,
    bankAccountName: isLandlord ? user.bankAccountName || '' : undefined,
    bankCode: isLandlord ? user.bankCode || '' : undefined,
    bankName: isLandlord ? user.bankName || '' : undefined,
    bankAccountMasked: isLandlord && user.bankAccountSource !== 'demo' && !bankAccountNeedsUpdate
      ? maskBankAccountNumber(bankAccountNumber)
      : '',
    bankAccountDisplay: isLandlord && user.bankAccountSource === 'demo' && !bankAccountNeedsUpdate
      ? bankAccountNumber
      : undefined,
    bankAccountSource: isLandlord ? user.bankAccountSource || '' : undefined,
    bankAccountConfigured: isLandlord
      ? !bankAccountNeedsUpdate && Boolean(user.bankAccountConfigured ?? (
        ['existing_account', 'demo'].includes(user.bankAccountSource) &&
        user.bankAccountName &&
        user.bankAccountNumber &&
        user.bankCode
      ))
      : undefined,
    bankAccountNeedsUpdate: isLandlord ? bankAccountNeedsUpdate : undefined,
    bankAccountVerified: isLandlord ? user.bankAccountVerified === true : undefined,
  };
};

// አዲስ ተጠቃሚ መመዝገብ
const register = async (req, res) => {
  try {
    const { name, email, username, password, phone, profilePhoto, role } = req.body;
    const requestedArea = String(req.body.area || '').trim();
    const normalizedName = String(name || '').trim();
    const normalizedEmail = normalizeAccountEmail(email);
    const normalizedUsername = username === undefined || username === null || username === ''
      ? undefined
      : String(username).trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedName || !normalizedEmail || !normalizedUsername || !normalizedPhone || !role || !password) {
      return res.status(400).json({ message: 'Name, email, username, phone, password and role are required.' });
    }

    if (!registrationNamePattern.test(normalizedName)) {
      return res.status(400).json({ message: 'Name must contain letters and spaces only.' });
    }
    if (!registrationEmailPattern.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!usernamePattern.test(normalizedUsername)) {
      return res.status(400).json({ message: 'Username must be 3-20 characters and use only letters, numbers, or underscores.' });
    }
    if (!registrationPhonePattern.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Use 09XXXXXXXX, 07XXXXXXXX, +2519XXXXXXXX, or +2517XXXXXXXX.' });
    }

    if (!['tenant', 'landlord'].includes(role)) {
      return res.status(400).json({ message: 'Public registration is limited to tenant or landlord accounts' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    let area = null;
    if (requestedArea) {
      area = await Area.findOne({ normalizedName: requestedArea.toLowerCase() }).select('name').lean();
      if (!area) return res.status(400).json({ message: 'Select an existing area.' });
    }

    // ተጠቃሚው አስቀድሞ መኖሩን ያረጋግጡ
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const escapedUsername = normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (await User.findOne({
      username: { $regex: `^${escapedUsername}$`, $options: 'i' },
    })) {
      return res.status(409).json({ message: 'That username is already in use.' });
    }

    // ይለፍ ቃሉን በሃሽ ያድርጉ
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // አዲስ ተጠቃሚ ይፍጠሩ
    const user = new User({
      name: normalizedName,
      email: normalizedEmail,
      username: normalizedUsername,
      password: hashedPassword,
      phone: normalizedPhone,
      area: area?.name || '',
      profilePhoto: profilePhoto?.trim() || '',
      role,
      status: 'pending',
    });

    await user.save();
    await ensureUserPermissions(user._id, permissionRoleForUser(user));

    await logAudit({
      req, actor: user, action: 'USER_REGISTERED', module: 'auth',
      targetType: 'user', targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      description: `${user.name} (${user.email}) registered as ${permissionRoleForUser(user)}.`,
    });

    res.status(201).json({
      message: 'Your account is waiting for Platform Admin approval.',
      user: serializeUser(user),
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.username) {
      return res.status(409).json({ message: 'That username is already in use.' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ተጠቃሚ መግቢያ
const login = async (req, res) => {
  try {
    const rawIdentifier = req.body?.identifier ?? req.body?.email;
    const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!identifier || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    if (identifier.length > 254 || password.length > 1024) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isEmail = identifier.includes('@');
    const normalizedIdentifier = isEmail ? normalizeLoginEmail(identifier) : identifier;
    if (
      (isEmail && !registrationEmailPattern.test(normalizedIdentifier)) ||
      (!isEmail && !usernamePattern.test(normalizedIdentifier))
    ) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const sessionId = crypto.randomUUID();
    req.auditSessionId = sessionId;

    const escapedIdentifier = normalizedIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchingUsers = await User.find({
      [isEmail ? 'email' : 'username']: { $regex: `^${escapedIdentifier}$`, $options: 'i' },
    })
      .limit(2)
      .select('+bankAccountNumber');
    const user = matchingUsers.length === 1 ? matchingUsers[0] : null;

    if (!user) {
      await logAudit({
        req,
        action: 'USER_LOGIN',
        module: 'auth',
        status: 'failed',
        details: { identifier: normalizedIdentifier },
        description: 'Login failed for an unknown account.',
      });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // ይለፍ ቃሉን ያረጋግጡ
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logAudit({
        req, actor: user, action: 'USER_LOGIN', module: 'auth', status: 'failed',
        details: { reason: 'invalid_credentials' },
        description: `Login failed for ${user.name} (${user.email}).`,
      });
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isPlatformAdmin = permissionRoleForUser(user) === 'platform_admin';
    if (!isPlatformAdmin && user.status === 'pending') {
      await logAudit({
        req, actor: user, action: 'USER_LOGIN', module: 'auth', status: 'denied',
        details: { reason: 'pending_account' },
        description: `Login denied for pending user ${user.name} (${user.email}).`,
      });
      return res.status(403).json({ message: 'Your account is waiting for Platform Admin approval.' });
    }
    if (!isPlatformAdmin && user.status === 'suspended') {
      await logAudit({
        req, actor: user, action: 'USER_LOGIN', module: 'auth', status: 'denied',
        details: { reason: 'suspended_account' },
        description: `Login denied for suspended user ${user.name} (${user.email}).`,
      });
      return res.status(403).json({ message: 'Your account is suspended.' });
    }
    if (!isPlatformAdmin && user.isActive === false) {
      await logAudit({
        req, actor: user, action: 'USER_LOGIN', module: 'auth', status: 'denied',
        details: { reason: 'inactive_account' },
        description: `Login denied for inactive user ${user.name} (${user.email}).`,
      });
      return res.status(403).json({
        message: 'This account is inactive. Contact an administrator for assistance.',
      });
    }

    await logAudit({
      req,
      actor: user,
      action: 'USER_LOGIN',
      module: 'auth',
      targetType: 'user',
      targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      description: `${user.name} (${user.email}) logged in.`,
    });

    // JWT ቶከን ያመንጩ
    const token = jwt.sign(
      { id: user._id, role: user.role, sessionId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = await getUserPermissions(user._id, permissionRoleForUser(user));
    res.json({
      message: 'Login successful',
      token,
      mustChangePassword: user.mustChangePassword === true,
      user: { ...serializeUser(user), permissions },
    });
  } catch (error) {
    const isDatabaseAuthenticationFailure = error?.code === 8000 ||
      (error?.name === 'MongoServerError' &&
        /bad auth\s*:\s*authentication failed/i.test(String(error.message || '')));

    if (isDatabaseAuthenticationFailure) {
      console.error(
        '[AUTH] MongoDB rejected database authentication (code=8000). Verify the backend MONGO_URI database credentials.'
      );
      return res.status(503).json({
        message: 'Login is temporarily unavailable because the database connection failed. Please try again later.',
      });
    }

    console.error('[AUTH] Login request failed:', {
      name: error?.name || 'Error',
      code: error?.code || 'unknown',
    });
    return res.status(500).json({
      message: 'Unable to log in right now. Please try again later.',
    });
  }
};

// የተጠቃሚ መረጃ ማግኘት
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password +bankAccountNumber');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const settings = await SystemSettings.findOne({ key: 'global' }).lean();
    res.json({
      ...serializeUser(user),
      permissions: req.user.permissions || {},
      systemPreferences: {
        defaultAppearance: settings?.defaultAppearance || 'system',
        notifications: settings?.notifications || { inAppEnabled: true, emailEnabled: true },
      },
    });
  } catch (error) {
    console.error('Unable to load user or system preferences:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// የተጠቃሚ መረጃ ማዘመን
const updateProfile = async (req, res) => {
  try {
    const { name, email, phone, profilePhoto, bankAccountName, bankAccountNumber, bankCode } = req.body;
    const bankInformationSubmitted = bankAccountName !== undefined ||
      bankAccountNumber !== undefined ||
      bankCode !== undefined;
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select('+bankAccountNumber');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (bankInformationSubmitted) {
      return res.status(400).json({
        message: 'Real bank account registration is disabled in this demo portal. Create an internal demo account from Bank Information instead.',
        code: 'REAL_BANK_ACCOUNT_REGISTRATION_DISABLED',
      });
    }

    if (name !== undefined) {
      const normalizedName = String(name).trim();
      if (!normalizedName) return res.status(400).json({ message: 'Name is required.' });
      user.name = normalizedName;
    }
    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
      }
      const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } }).select('_id');
      if (existingUser) return res.status(409).json({ message: 'That email address is already in use.' });
      user.email = normalizedEmail;
    }
    if (phone !== undefined) user.phone = String(phone).trim();
    user.profilePhoto = profilePhoto || user.profilePhoto;
    await user.save();

    await logAudit({
      req, actor: user, action: 'USER_UPDATED', module: 'account',
      targetType: 'user', targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      description: `${user.name} (${user.email}) updated their profile information.`,
    });

    res.json({ 
      message: 'Profile updated successfully',
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const updateProfilePhoto = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Choose a JPG, PNG, or WEBP profile photo.' });
  }

  try {
    const user = await User.findById(req.user.id)
      .select('+bankAccountNumber');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [profilePhoto] = await uploadFilesToUrls([req.file], req, 'image');
    user.profilePhoto = profilePhoto;
    await user.save();

    await logAudit({
      req, actor: user, action: 'USER_UPDATED', module: 'account',
      targetType: 'user', targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      description: `${user.name} (${user.email}) updated their profile photo.`,
    });

    return res.json({
      message: 'Profile photo updated successfully.',
      user: serializeUser(user),
    });
  } catch (error) {
    console.error('Profile photo upload error:', error);
    return res.status(500).json({ message: 'Unable to update profile photo.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const passwordMatches = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatches) return res.status(400).json({ message: 'Current password is incorrect.' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await logAudit({
      req, actor: user, action: 'PASSWORD_CHANGED', module: 'auth',
      targetType: 'user', targetId: user._id, targetLabel: `${user.name} (${user.email})`,
      description: `${user.name} (${user.email}) changed their password.`,
    });

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Unable to change password.' });
  }
};

const changePasswordOnFirstLogin = async (req, res) => {
  try {
    const newPassword = req.body?.newPassword;
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 1024) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.mustChangePassword !== true) {
      return res.status(409).json({ message: 'A first-login password change is not required.' });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ message: 'New password must be different from the temporary password.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    await logAudit({
      req, actor: user, action: 'PASSWORD_CHANGED', module: 'auth',
      targetType: 'user', targetId: user._id, targetLabel: `${user.name} (${user.email})`,
      details: { firstLogin: true },
      description: `${user.name} (${user.email}) changed their temporary password.`,
    });
    return res.json({ message: 'Password changed successfully.', mustChangePassword: false });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to change password.' });
  }
};

const requestPasswordReset = async (req, res) => {
  const responseMessage = 'If an account exists for that email, password reset instructions will be sent.';

  try {
    const normalizedEmail = normalizeLoginEmail(req.body.email);
    if (!registrationEmailPattern.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const emailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
    if (isProduction && !emailConfigured) {
      return res.status(503).json({ message: 'Password reset email is not configured on this server.' });
    }

    const user = await User.findOne({
      email: normalizedEmail,
      role: { $in: ['tenant', 'landlord'] },
    });
    if (!user) return res.json({ message: responseMessage });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
    let emailSent = false;
    if (emailConfigured) {
      const emailResult = await sendEmail({
        to: user.email,
        subject: 'Reset your Rental Verification password',
        text: `Use this link to reset your password. It expires in one hour: ${resetUrl}`,
        html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Create a new password</a></p><p>This link expires in one hour. If you did not request this, ignore this email.</p>`,
      });
      emailSent = emailResult.success;
    }

    if (!emailSent && isProduction) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();
      console.error('Password reset email could not be sent.');
    }

    if (!emailConfigured && !isProduction) {
      return res.json({
        message: 'Email is not configured in development. Use this temporary link to reset your password.',
        devResetUrl: resetUrl,
      });
    }

    if (!emailSent && !isProduction) {
      return res.json({
        message: 'The email could not be sent in development. Use this temporary link to reset your password.',
        devResetUrl: resetUrl,
      });
    }

    return res.json({ message: responseMessage });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ message: 'Unable to process the password reset request right now.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Reset token and new password are required.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
      role: { $in: ['tenant', 'landlord'] },
    });

    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Request a new one.' });
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();

    await logAudit({
      req, actor: user, action: 'PASSWORD_RESET', module: 'auth',
      targetType: 'user', targetId: user._id,
      targetLabel: `${user.name} (${user.email})`,
      description: `${user.name} (${user.email}) reset their password using an email link.`,
    });

    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ message: 'Unable to reset password right now.' });
  }
};

const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email role');
    await logAudit({
      req,
      actor: user || req.user,
      action: 'USER_LOGOUT',
      module: 'auth',
      targetType: 'user',
      targetId: req.user.id,
      targetLabel: user?.name || req.user.name,
      description: user ? `${user.name} (${user.email || ''}) logged out.` : 'User logged out.',
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login, getMe, updateProfile, updateProfilePhoto, changePassword, changePasswordOnFirstLogin, requestPasswordReset, resetPassword, logout, serializeUser };