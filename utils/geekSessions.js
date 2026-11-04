// Active login sessions for geeks, so a geek can stay logged in on several
// devices (website, phone app) at once, and logging out ends only that device.
//
// Each session is stored as a SHA-256 fingerprint of its JWT. JWTs are long and
// random, so a fast hash is safe here (bcrypt's slowness only matters for
// guessable secrets like passwords) and keeps the per-request check cheap.
//
// Sessions issued before this existed live in the legacy `authToken` field as a
// bcrypt hash; they keep working until they expire or log out.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Geek } = require('../models/geekModel.js');

const MAX_SESSIONS = 5;

const fingerprint = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Record a newly issued session token, dropping the oldest beyond MAX_SESSIONS.
const addGeekSession = async (geekId, token) => {
  const geek = await Geek.findById(geekId).select('+authTokens');
  if (!geek) return;
  const authTokens = [...(geek.authTokens || []), fingerprint(token)].slice(-MAX_SESSIONS);
  await Geek.updateOne({ _id: geekId }, { $set: { authTokens } });
};

// True when `token` is one of the geek's active sessions. `geek` must have been
// loaded with `+authTokens` (and `authToken`, which is selected by default).
const hasGeekSession = async (geek, token) => {
  if (!geek || !token) return false;
  if ((geek.authTokens || []).includes(fingerprint(token))) return true;
  return !!geek.authToken && bcrypt.compare(token, geek.authToken);
};

// End one session (logout on one device).
const removeGeekSession = async (geekId, token) => {
  const geek = await Geek.findById(geekId).select('+authTokens');
  if (!geek) return;
  const update = { $pull: { authTokens: fingerprint(token) } };
  if (geek.authToken && (await bcrypt.compare(token, geek.authToken))) update.$unset = { authToken: 1 };
  await Geek.updateOne({ _id: geekId }, update);
};

module.exports = { addGeekSession, hasGeekSession, removeGeekSession, MAX_SESSIONS };
