const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const Admin = require('../models/adminModel.js');

 const authenticateJWT = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.cookies?.auth_token || req.cookies?.geek_auth_token // Get token from cookies
  
  if (!token) {
    return res.status(403).json({ message: "No token provided, authorization denied." });
  }

    try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};


const authenticateMobileJWT = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.cookies?.auth_token || req.cookies?.geek_auth_token // Get token from cookies;
  if (!token) {
    return res.status(403).json({ message: "No token provided, authorization denied." });
  }

    try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};






const protectAdmin = asyncHandler(async (req, res, next) => {
  const token = req.cookies.admin; // 🔥 CORRECT
  console.log("ProtectAdmin Middleware Invoked", req.cookies?.admin);

  if (!token) {
    return res.status(401).json({ message: "No token, not authorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token failed" });
  }
});

module.exports = { authenticateJWT, protectAdmin, authenticateMobileJWT };
