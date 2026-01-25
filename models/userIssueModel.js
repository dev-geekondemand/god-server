const mongoose = require('mongoose');
const { Schema } = mongoose;

// --- Nested Schemas ---
const deviceDetailsSchema = new Schema({
  brand: { type: String },
  model: { type: String },
  device_type: { type: String },
  os_version: { type: String },
}, { _id: false });

const purchaseInformationSchema = new Schema({
  purchase_date: { type: String }, // You can change to Date if always in ISO format
  warranty_status: { type: String },
  purchase_location: { type: String },
}, { _id: false });

const problemDescriptionSchema = new Schema({
  symptoms: { type: String },
  error_messages: { type: String },
  frequency: { type: String },
  trigger: { type: String },
  troubleshooting_attempts: { type: String },
}, { _id: false });

const categoryDetailsSchema = new Schema({
  category: { type: String },
  subcategory: { type: String },
}, { _id: false });

// --- Main Schema ---
const userIssueSchema = new Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conversation_id: { type: String, required: true },
  status: {
    type: String,
    enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], // You can modify these as per `IssueStatus` enum
    default: 'OPEN'
  },
  device_details: deviceDetailsSchema,
  purchase_info: purchaseInformationSchema,
  problem_description: problemDescriptionSchema,
  category_details: categoryDetailsSchema,
  summary: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { collection: 'user_issues' });

// Optional: auto-update `updatedAt`
userIssueSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const UserIssue = mongoose.model('UserIssue', userIssueSchema);
module.exports = UserIssue;
