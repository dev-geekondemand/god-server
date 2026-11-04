// Session handoff between sites that share this backend (god-ui → god-support).
// A site the user is logged into mints a short-lived handoff token; the other
// site exchanges it once for its own session cookie, because browsers keep each
// site's cookies separate (CHIPS partitioning) and it can't read the first one.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const UsedSsoToken = require('../models/usedSsoTokenModel.js');

const HANDOFF_TTL_SECONDS = 60;
const SESSION_COOKIE = { geek: 'geek_auth_token', seeker: 'auth_token' };

const mintHandoffToken = (userId) => jwt.sign(
  { id: userId, purpose: 'sso', jti: crypto.randomUUID() },
  process.env.JWT_SECRET,
  { expiresIn: HANDOFF_TTL_SECONDS }
);

// Verifies a handoff token and marks it used, so it works exactly once — it
// travels in a URL (?ssoToken=), where logs and history can capture it.
// Returns { decoded } or { status, message } to send back.
const consumeHandoffToken = async (token) => {
  if (!token) return { status: 400, message: 'Token is required' };

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { status: 401, message: 'Invalid or expired token' };
  }
  if (decoded.purpose !== 'sso' || !decoded.jti) {
    return { status: 401, message: 'Invalid token' };
  }

  try {
    await UsedSsoToken.create({ _id: decoded.jti, expiresAt: new Date(decoded.exp * 1000) });
  } catch (err) {
    if (err?.code === 11000) return { status: 401, message: 'This link has already been used' };
    throw err;
  }
  return { decoded };
};

const sessionCookieOptions = () => {
  const prod = process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: prod, sameSite: prod ? 'None' : 'Lax', partitioned: prod, path: '/' };
};

// A handoff makes the receiving site act as exactly one role. Clearing the
// other role's cookie stops role-agnostic routes (e.g. tickets, which read the
// seeker cookie first) from answering as the wrong account when someone has
// used the site as both a seeker and a geek.
const setHandoffSession = (res, role, sessionToken) => {
  const other = role === 'geek' ? 'seeker' : 'geek';
  res.clearCookie(SESSION_COOKIE[other], sessionCookieOptions());
  res.cookie(SESSION_COOKIE[role], sessionToken, { ...sessionCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
};

module.exports = { mintHandoffToken, consumeHandoffToken, setHandoffSession, HANDOFF_TTL_SECONDS };
