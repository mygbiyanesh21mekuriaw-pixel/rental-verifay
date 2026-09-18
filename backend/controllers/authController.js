const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createSystemLog } = require('./systemLogController');
const { listChapaBanks } = require('../utils/payoutProvider');

const maskAccountNumber = (value) => {
  const accountNumber = String(value || '');
  if (!accountNumber) return '';
  return `${'*'.repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
};

const normalizeLoginEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return normalizedEmail.replace(/@rentalverifay\.com$/i, '@rentalverify.com');
};

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
  bankAccountMasked: user.role === 'landlord' ? maskAccountNumber(user.bankAccountNumber) : undefined,
});

// አዲስ ተጠቃሚ መመዝገብ
const register = async (req, res) => {
  try {
    const { name, email, password, phone, profilePhoto, role } = req.body;
    const normalizedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password and role are required' });
    }

    if (!['tenant', 'landlord'].includes(role)) {
      return res.status(400).json({ message: 'Public registration is limited to tenant or landlord accounts' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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
      phone: phone || '',
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
    const user = await User.findOne({ email: normalizedEmail });
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
    const user = await User.findById(req.user.id).select('-password');
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
    const { name, phone, profilePhoto, bankAccountName, bankAccountNumber, bankCode } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.phone = phone || user.phone;
    user.profilePhoto = profilePhoto || user.profilePhoto;
    if (user.role === 'landlord') {
      if (bankAccountName !== undefined || bankAccountNumber !== undefined || bankCode !== undefined) {
        if (!String(bankAccountName || '').trim() || !String(bankAccountNumber || '').trim() || !String(bankCode || '').trim()) {
          return res.status(400).json({ message: 'Bank, account name and account number are required' });
        }
        const bankResult = await listChapaBanks();
        const selectedBank = bankResult.banks.find((bank) => bank.code === String(bankCode).trim());
        if (!bankResult.ok || !selectedBank) {
          return res.status(400).json({ message: 'Select a valid Chapa-supported bank' });
        }
        user.bankAccountName = String(bankAccountName).trim();
        user.bankAccountNumber = String(bankAccountNumber).trim();
        user.bankCode = selectedBank.code;
        user.bankName = selectedBank.name;
      }
    }
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

module.exports = { register, login, getMe, updateProfile, logout };