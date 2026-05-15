const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema(
  {
    userId:          { type: mongoose.Schema.Types.ObjectId, required: true },
    role:            { type: String, enum: ['Seeker', 'Geek'], required: true },
    authProvider:    { type: String, enum: ['custom', 'google', 'microsoft', 'linkedin', 'apple'], default: 'custom' },
    logoutAt:        { type: Date, default: null },
    sessionDuration: { type: Number, default: null }, // minutes
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoginEvent', loginEventSchema);
