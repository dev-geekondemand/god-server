const mongoose = require('mongoose');

const RefundSchema = new mongoose.Schema(
  {
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
    geek: { type: mongoose.Schema.Types.ObjectId, ref: 'Geek', required: true, index: true },

    // Snapshot of what's being refunded, taken at request time
    razorpayPaymentId: { type: String, required: true },
    plan: { type: String, enum: ['Startup', 'Advance', 'Professional'], required: true },
    amount: { type: Number, required: true }, // paise

    reason: { type: String, required: true },

    status: {
      type: String,
      enum: ['requested', 'processing', 'processed', 'rejected', 'failed'],
      default: 'requested',
      index: true,
    },

    adminNote: String, // rejection reason, or Razorpay error description on failure
    razorpayRefundId: { type: String, index: true },

    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    processedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Refund', RefundSchema);
