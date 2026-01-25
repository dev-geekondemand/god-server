const mongoose = require('mongoose');

const aadhaarVerificationSchema = new mongoose.Schema({
  geek: { type: mongoose.Schema.Types.ObjectId, ref: 'Geek', required: true },
  idNumber: { type: String, required: true },
  status: { type: String, enum: ['completed', 'in_progress', 'error','failed'], default: 'error' },
  response: mongoose.Schema.Types.Mixed,
  verifiedAt: { type: Date, default: Date.now },
  requestId: { type: String, required: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('AadhaarVerification', aadhaarVerificationSchema);
