const mongoose = require('mongoose');

const PROFILE_AUDIT_ACTIONS = [
  'profile_updated',
  'profile_image_updated',
  'address_updated',
  'geek_details_updated',
];

const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const profileAuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ['Seeker', 'Geek'], required: true, index: true },
    action: { type: String, enum: PROFILE_AUDIT_ACTIONS, required: true, index: true },
    changes: { type: [changeSchema], default: [] },
    performedBy: { type: String, enum: ['self', 'admin', 'system'], default: 'self' },
    performedById: mongoose.Schema.Types.ObjectId,
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
  },
  // Only createdAt is needed (it doubles as "when the change happened"); updatedAt is
  // disabled because Mongoose would auto-inject it into every updateMany/updateOne call
  // (including the archive-only updates below), tripping the immutability guard.
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Audit records are write-once: only the archive flag may ever be changed after creation.
// $setOnInsert is ignored here — Mongoose's timestamps plugin injects $setOnInsert.createdAt
// into every update regardless of whether `upsert` is actually set, but it only ever takes
// effect on the insert branch of a true upsert (none of our update calls use upsert), so it
// never mutates an existing document's content.
const ALLOWED_UPDATE_PATHS = new Set(['archived', 'archivedAt']);
profileAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const update = this.getUpdate() || {};
  const paths = new Set();
  Object.keys(update).forEach((key) => {
    if (key === '$setOnInsert') return;
    if (key.startsWith('$')) {
      Object.keys(update[key] || {}).forEach((p) => paths.add(p));
    } else {
      paths.add(key);
    }
  });
  for (const path of paths) {
    if (!ALLOWED_UPDATE_PATHS.has(path)) {
      throw new Error('Profile audit logs are immutable');
    }
  }
});

module.exports = mongoose.model('ProfileAuditLog', profileAuditLogSchema);
module.exports.PROFILE_AUDIT_ACTIONS = PROFILE_AUDIT_ACTIONS;
