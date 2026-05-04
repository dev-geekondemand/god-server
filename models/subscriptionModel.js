const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema(
  {
    geek: { type: mongoose.Schema.Types.ObjectId, ref: 'Geek', required: true, index: true },
    plan: { type: String, enum: ['Startup', 'Advance', 'Professional'], required: true },
    status: {
      type: String,
      enum: ['created', 'active', 'paused', 'cancelled'],
      default: 'created',
    },

    // Razorpay references
    razorpaySubscriptionId: { type: String, index: true },
    razorpayPaymentId: String,

    // Billing period
    currentPeriodStart: Date,
    currentPeriodEnd: Date,

    // Downgrade: plan takes effect at end of current period
    pendingPlan: { type: String, enum: ['Startup', 'Advance', 'Professional'] },
    cancelAtPeriodEnd: { type: Boolean, default: false },

    // Failure tracking
    failedPaymentCount: { type: Number, default: 0 },
    lastFailedPaymentAt: Date,

    cancelledAt: Date,
    pausedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', SubscriptionSchema);
