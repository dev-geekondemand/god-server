const mongoose = require("mongoose");

// One row per session-handoff token that has been exchanged, keyed by the
// token's jti. The unique _id makes a second exchange of the same token fail
// atomically (even across backend instances); rows expire with the token.
const usedSsoTokenSchema = new mongoose.Schema({
  _id: { type: String },
  expiresAt: { type: Date, required: true },
});

usedSsoTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.UsedSsoToken || mongoose.model("UsedSsoToken", usedSsoTokenSchema);
