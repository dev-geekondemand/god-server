const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const Admin = require('../models/adminModel.js');
// const Request = require('../models/serviceRequest.js');
// const Seeker = require('../models/seekerModel.js');
// const Geek = require('../models/geekModel.js');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id, role: 'Admin' }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// POST /api/admin/login
const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

  const isMatch = await admin.matchPassword(password);
  if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    res.cookie("admin", generateToken(admin._id), {
    httpOnly: true,
    secure: true,          // REQUIRED on HTTPS (Vercel)
    sameSite: "none",      // REQUIRED for cross-domain
    maxAge: 7 * 24 * 60 * 60 * 1000, // optional (7 days)
  });

 
  res.status(200).json({
    _id: admin._id,
    name: admin.name,
    email: admin.email,
  });
});

// POST /api/admin/register
const registerAdmin = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await Admin.findOne({ email });
  if (existing) return res.status(400).json({ message: 'Admin already exists' });

  const admin = await Admin.create({ name, email, password });
  res.cookie('admin', generateToken(admin._id), { httpOnly: true, secure: process.env.NODE_ENV === 'production' });


  res.status(201).json({
    _id: admin._id,
    name: admin.name,
    email: admin.email,
    // token: generateToken(admin._id)
  });
});


const loadAdmin = asyncHandler(async (req, res) => {
  const adminId = req.admin.id;
  const admin = await Admin.findById(adminId).select('-password');
  res.status(200).json(admin);
});

const logoutAdmin = asyncHandler(async (req, res) => {
  res.clearCookie('admin', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });

  res.status(200).json({ message: 'Logged out successfully' });
});


module.exports = {
  loginAdmin,
  registerAdmin,
  loadAdmin,
  logoutAdmin
};
