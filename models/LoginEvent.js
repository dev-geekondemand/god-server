const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema(
  {
    // Null on a failed attempt where no account matched the submitted identifier.
    userId:          { type: mongoose.Schema.Types.ObjectId, default: null },
    role:            { type: String, enum: ['Seeker', 'Geek'], required: true },
    authProvider:    { type: String, enum: ['custom', 'google', 'microsoft', 'linkedin', 'apple'], default: 'custom' },
    status:          { type: String, enum: ['success', 'failed'], default: 'success' },
    // Why a failed attempt failed, e.g. 'invalid_otp' | 'not_registered'.
    failureReason:   { type: String, default: null },
    // Phone/email submitted on a failed attempt, so failures are traceable without a userId.
    identifier:      { type: String, default: null },
    logoutAt:        { type: Date, default: null },
    sessionDuration: { type: Number, default: null }, // minutes
  },
  { timestamps: true }
);

// Every analytics query filters on a createdAt range, usually narrowed by role/status.
loginEventSchema.index({ createdAt: -1 });
loginEventSchema.index({ status: 1, role: 1, createdAt: -1 });

module.exports = mongoose.model('LoginEvent', loginEventSchema);
