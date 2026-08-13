const mongoose = require('mongoose');
const { Schema } = mongoose;

const attachmentSchema = new Schema({
  public_id: String,
  url: String,
  filename: String,
  mimetype: String,
}, { _id: false });

const messageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, required: true, refPath: 'messages.senderModel' },
  senderModel: { type: String, enum: ['User', 'Geek', 'Admin'], required: true },
  body: { type: String, required: true },
  attachments: [attachmentSchema],
  createdAt: { type: Date, default: Date.now },
});

const noteSchema = new Schema({
  admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  note: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const statusHistorySchema = new Schema({
  status: { type: String, required: true },
  changedBy: { type: Schema.Types.ObjectId, refPath: 'statusHistory.changedByModel' },
  changedByModel: { type: String, enum: ['User', 'Geek', 'Admin', 'System'], required: true },
  note: String,
  at: { type: Date, default: Date.now },
});

const ticketSchema = new Schema({
  ticketNumber: { type: String, unique: true, index: true },
  raisedBy: { type: Schema.Types.ObjectId, required: true, index: true, refPath: 'raisedByModel' },
  raisedByModel: { type: String, enum: ['User', 'Geek'], required: true },
  category: {
    type: String,
    enum: ['Payment Issues', 'Geek Conduct', 'Seeker Conduct', 'Service Quality', 'Technical Issues'],
    required: true,
  },
  subject: { type: String, required: true },
  description: { type: String, required: true },
  relatedServiceRequest: { type: Schema.Types.ObjectId, ref: 'ServiceRequest' },
  relatedGeek: { type: Schema.Types.ObjectId, ref: 'Geek' },
  attachments: [attachmentSchema],
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Awaiting Response', 'Resolved', 'Closed'],
    default: 'Open',
    index: true,
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium',
    index: true,
  },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
  sla: {
    firstResponseDueAt: Date,
    resolutionDueAt: Date,
    firstRespondedAt: Date,
    resolvedAt: Date,
    breached: { type: Boolean, default: false },
    escalated: { type: Boolean, default: false },
    escalatedAt: Date,
  },
  resolution: {
    summary: String,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  messages: [messageSchema],
  internalNotes: [noteSchema],
  statusHistory: [statusHistorySchema],
}, { timestamps: true });

ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });
ticketSchema.index({ raisedBy: 1, createdAt: -1 });
ticketSchema.index({ 'sla.resolutionDueAt': 1, status: 1 });

ticketSchema.pre('save', function (next) {
  if (!this.ticketNumber) {
    this.ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
