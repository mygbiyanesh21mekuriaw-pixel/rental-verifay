const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createSystemLog } = require('./systemLogController');
const { decryptBankAccountNumber } = require('../utils/bankAccountCrypto');
const maskBankAccountNumber = require('../utils/maskBankAccountNumber');
const sendEmail = require('../utils/email');
const { uploadFilesToUrls } = require('../utils/uploadMedia');

const registrationNamePattern = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
const registrationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const registrationPhonePattern = /^(?:0[79]\d{8}|\+251[79]\d{8})$/;

const normalizeLoginEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return normalizedEmail.replace(/@rentalverifay\.com$/i, '@rentalverify.com');
};

const normalizeAccountEmail = (email) => normalizeLoginEmail(email);

const serializeUser = (user) => ({
  id: user._id ? user._id.toString() : user.id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  profilePhoto: user.profilePhoto || '',
  role: user.role,
  adminType: user.role === 'admin'
    ? user.adminType || (user.adminAreas?.length ? 'area' : 'platform')
    : undefined,
  adminAreas: user.role === 'admin' ? user.adminAreas || [] : undefined,
  bankAccountName: user.role === 'landlord' ? user.bankAccountName || '' : undefined,
  bankCode: user.role === 'landlord' ? user.bankCode || '' : undefined,
  bankName: user.role === 'landlord' ? user.bankName || '' : undefined,
  bankAccountMasked: user.role === 'landlord' && user.bankAccountSource !== 'demo'
    ? maskBankAccountNumber(decryptBankAccountNumber(user.bankAccountNumber))
    : '',
  bankAccountDisplay: user.role === 'landlord' && user.bankAccountSource === 'demo'
    ? decryptBankAccountNumber(user.bankAccountNumber)
    : undefined,
  bankAccountSource: user.role === 'landlord' ? user.bankAccountSource || '' : undefined,
  bankAccountConfigured: user.role === 'landlord'
    ? Boolean(user.bankAccountConfigured ?? (
      ['existing_account', 'demo'].includes(user.bankAccountSource) &&
      user.bankAccountName &&
      user.bankAccountNumber &&
      user.bankCode
    ))
    : undefined,
  bankAccountVerified: user.role === 'landlord' ? user.bankAccountVerified === true : undefined,
});

// አዲስ ተጠቃሚ መመዝገብ
const register = async (req, res) => {
  try {
    const { name, email, password, phone, profilePhoto, role } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedEmail = normalizeAccountEmail(email);
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedName || !normalizedEmail || !password || !normalizedPhone || !role) {
      return res.status(400).json({ message: 'Name, email, phone, password and role are required.' });
    }

    if (!registrationNamePattern.test(normalizedName)) {
      return res.status(400).json({ message: 'Name must contain letters and spaces only.' });
    }
    if (!registrationEmailPattern.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
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

    // ተጠቃሚው አስቀድሞ መኖሩን ያረጋግጡ
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // ይለፍ ቃሉን በሃሽ ያድርጉ
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // አዲስ ተጠቃሚ ይፍጠሩ
    const user = new User({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      phone: normalizedPhone,
      profilePhoto: profilePhoto?.trim() || '',
      role,
    });

    await user.save();

    await createSystemLog({
      user: user._id,
      role: user.role,
      action: 'USER_REGISTERED',
      description: `User ${user.name} registered as ${user.role}.`,
      status: 'success',
      ipAddress: req.ip || '',
    });

    // JWT ቶከን ያመንጩ
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ተጠቃሚ መግቢያ
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeLoginEmail(email);

    // ተጠቃሚውን ያግኙ
    const user = await User.findOne({ email: normalizedEmail })
      .select('+bankAccountNumber');
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // ይለፍ ቃሉን ያረጋግጡ
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    await createSystemLog({
      user: user._id,
      role: user.role,
      action: 'USER_LOGIN',
      description: `User ${user.name} logged in successfully.`,
      status: 'success',
      ipAddress: req.ip || '',
    });

    // JWT ቶከን ያመንጩ
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.json(serializeUser(user));
  } catch (error) {
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

    await createSystemLog({
      user: user._id,
      role: user.role,
      action: 'USER_UPDATED',
      description: `User ${user.name} updated their profile information.`,
      status: 'success',
      ipAddress: req.ip || '',
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

    await createSystemLog({
      user: user._id,
      role: user.role,
      action: 'USER_UPDATED',
      description: `User ${user.name} updated their profile photo.`,
      status: 'success',
      ipAddress: req.ip || '',
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

    await createSystemLog({
      user: user._id,
      role: user.role,
      action: 'PASSWORD_CHANGED',
      description: `User ${user.name} changed their password.`,
      status: 'success',
      ipAddress: req.ip || '',
    });

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Unable to change password.' });
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

    await createSystemLog({
      user: user._id,
      role: user.role,
      action: 'PASSWORD_RESET',
      description: `User ${user.name} reset their password using an email link.`,
      status: 'success',
      ipAddress: req.ip || '',
    });

    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ message: 'Unable to reset password right now.' });
  }
};

const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name role');
    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: 'USER_LOGOUT',
      description: user ? `${user.name} logged out.` : 'User logged out.',
      status: 'success',
      ipAddress: req.ip || '',
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login, getMe, updateProfile, updateProfilePhoto, changePassword, requestPasswordReset, resetPassword, logout };