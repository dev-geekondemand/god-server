const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { Geek } = require('../models/geekModel');
const { hasGeekSession } = require('../utils/geekSessions');

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
    // The token must be one of the geek's active sessions (any device). Checked
    // on a separate lean read so req.user never carries the session list.
    const sessions = await Geek.findById(decoded.id).select('authToken +authTokens').lean();
    if (!sessions) {
      return res.status(401).json({ message: 'Not authorized, geek not found or not logged in' });
    }
    if (!(await hasGeekSession(sessions, token))) {
      return res.status(401).json({ message: 'Invalid or expired token. Login Again.' });
    }

    // Attach geek to request
    req.user = await Geek.findById(decoded.id);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token verification failed. Login Again.' });
  }
});

module.exports = { protectMobileGeek };