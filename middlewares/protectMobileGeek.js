const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const { Geek } = require('../models/geekModel');

const protectMobileGeek = asyncHandler(async (req, res, next) => {
  
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(403).json({ message: "No token provided, authorization denied." });
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, Geek not logged in' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find geek by ID
    const geek = await Geek.findById(decoded.id);
    if (!geek || !geek.authToken) {
      return res.status(401).json({ message: 'Not authorized, geek not found or not logged in' });
    }

    // Compare the hashed token in DB
    const isMatch = await bcrypt.compare(token, geek.authToken);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid or expired token. Login Again.' });
    }

    // Attach geek to request
    req.user = geek;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token verification failed. Login Again.' });
  }
});

module.exports = { protectMobileGeek };