const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const Admin = require('../models/adminModel.js');
const Seeker = require('../models/seekerModel.js');
const { Geek } = require('../models/geekModel.js');

// Guards a destructive action on one account so that ONLY an authenticated
// admin, or the owner of that exact account, may perform it.
//
// Every token in this app is signed with the same JWT_SECRET, so a valid
// signature alone proves nothing about *which* account is acting — the id
// inside the token must be compared against the account being targeted.
// That comparison is the whole point of this middleware.

const MODELS = { Geek, Seeker };

// Resolves an admin exactly the way protectAdmin does, but without rejecting
// the request when absent — a non-admin may still qualify as the owner.
const resolveAdmin = async (req) => {
  const token = req.cookies?.admin;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await Admin.findById(decoded.id).select('-password');
  } catch {
    return null;
  }
};

// Geek and seeker sessions use different cookies, and mobile clients send a
// Bearer header instead.
const actorToken = (req) => {
  const bearer = req.headers.authorization?.startsWith('Bearer')
    ? req.headers.authorization.split(' ')[1]
    : null;
  return req.cookies?.geek_auth_token || req.cookies?.auth_token || bearer || null;
};

const allowAdminOrSelf = (modelName) => {
  const Model = MODELS[modelName];
  if (!Model) throw new Error(`allowAdminOrSelf: unknown model "${modelName}"`);

  return asyncHandler(async (req, res, next) => {
    const admin = await resolveAdmin(req);
    if (admin) {
      req.admin = admin;
      req.deletedBy = { type: 'Admin', id: String(admin._id) };
      return next();
    }

    const token = actorToken(req);
    if (!token || token === 'null') {
      return res.status(401).json({ message: 'Not authorized, login required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const targetId = req.params.id;
    if (!decoded?.id || String(decoded.id) !== String(targetId)) {
      return res.status(403).json({ message: 'You can only delete your own account' });
    }

    const account = await Model.findById(targetId).select('authToken');
    if (!account) {
      return res.status(404).json({ message: `${modelName} not found` });
    }

    // OTP logins store a bcrypt hash of the issued token, so logging out
    // invalidates it. When one is present we require it to match, which stops a
    // stale token being replayed. OAuth logins (e.g. loginWithGoogle) never set
    // authToken, so the verified JWT is all those sessions have to offer.
    if (account.authToken && !(await bcrypt.compare(token, account.authToken))) {
      return res.status(401).json({ message: 'Invalid or expired token. Login again.' });
    }

    req.deletedBy = { type: modelName, id: String(targetId) };
    next();
  });
};

module.exports = allowAdminOrSelf;
