const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const { Geek } = require('../models/geekModel');

const protectGeek = asyncHandler(async (req, res, next) => {
  let token;
  
  if (req.cookies?.geek_auth_token) {
    token = req.cookies.geek_auth_token;    
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
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





module.exports = protectGeek;
