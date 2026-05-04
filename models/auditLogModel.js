const mongoose = require('mongoose');

const AUDIT_ACTIONS = [
  'plan_selected',
  'subscription_created',
  'payment_success',
  'payment_failed',
  'payment_retry_1',
  'payment_retry_2',
  'payment_retry_3',
  'plan_activated',
  'plan_upgraded',
  'plan_downgraded',
  'plan_cancelled',
  'plan_paused',
  'plan_reactivated',
  'badge_added',
  'badge_removed',
  'refund_issued',
  'subscription_renewed',
  'subscription_halted',
];

const AuditLogSchema = new mongoose.Schema(
  {
    geek: { type: mongoose.Schema.Types.ObjectId, ref: 'Geek', required: true, index: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
    performedBy: { type: String, enum: ['geek', 'admin', 'system', 'razorpay'], default: 'system' },
    performedById: mongoose.Schema.Types.ObjectId,
  },
  {
    timestamps: true,
    // Prevent accidental updates — audit records are write-once
  }
);

// Audit logs must never be updated or deleted
AuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  throw new Error('Audit logs are immutable');
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
