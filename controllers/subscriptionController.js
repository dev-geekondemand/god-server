const Razorpay = require('razorpay');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const { Geek } = require('../models/geekModel.js');
const Subscription = require('../models/subscriptionModel.js');
const AuditLog = require('../models/auditLogModel.js');

const PLANS = {
  Advance: { amount: 49900, razorpayPlanId: () => process.env.RAZORPAY_PLAN_ADVANCE_ID },
  Professional: { amount: 99900, razorpayPlanId: () => process.env.RAZORPAY_PLAN_PROFESSIONAL_ID },
};

let _razorpay;
function getRazorpay() {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function log(geekId, action, oldValue, newValue, metadata = {}, performedBy = 'system', performedById = null) {
  await AuditLog.create({ geek: geekId, action, oldValue, newValue, metadata, performedBy, performedById });
}

async function activatePlan(geek, subscription, plan, razorpayPaymentId = null) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  subscription.plan = plan;
  subscription.status = 'active';
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = periodEnd;
  subscription.failedPaymentCount = 0;
  subscription.lastFailedPaymentAt = undefined;
  subscription.pausedAt = undefined;
  subscription.cancelAtPeriodEnd = false;
  subscription.pendingPlan = undefined;
  if (razorpayPaymentId) subscription.razorpayPaymentId = razorpayPaymentId;
  await subscription.save();

  const oldPlan = geek.subscriptionPlan;
  geek.subscriptionPlan = plan;
  geek.subscription = subscription._id;
  await geek.save();

  return { oldPlan };
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

// Step 1: Geek chooses a paid plan → create Razorpay subscription → return id to frontend
const createSubscription = asyncHandler(async (req, res) => {
  const geekId = req.user._id;
  const { plan } = req.body;

  if (!PLANS[plan]) {
    return res.status(400).json({ message: 'Invalid plan. Choose Advance or Professional.' });
  }

  const planId = PLANS[plan].razorpayPlanId();
  if (!planId) {
    return res.status(500).json({ message: `Razorpay plan ID for ${plan} is not configured.` });
  }

  const geek = await Geek.findById(geekId);
  if (!geek) return res.status(404).json({ message: 'Geek not found' });

  // Cancel any existing active subscription before creating a new one
  const existing = await Subscription.findOne({ geek: geekId, status: { $in: ['active', 'created'] } });
  if (existing?.razorpaySubscriptionId) {
    try { await getRazorpay().subscriptions.cancel(existing.razorpaySubscriptionId, { cancel_at_cycle_end: 0 }); } catch (_) {}
    existing.status = 'cancelled';
    existing.cancelledAt = new Date();
    await existing.save();
  }

  const rzpSub = await getRazorpay().subscriptions.create({
    plan_id: planId,
    total_count: 120, // up to 10 years; effectively indefinite
    quantity: 1,
    customer_notify: 1,
    notes: { geekId: geekId.toString(), plan },
  });

  await Subscription.create({
    geek: geekId,
    plan,
    status: 'created',
    razorpaySubscriptionId: rzpSub.id,
  });

  await log(geekId, 'plan_selected', geek.subscriptionPlan, plan, { razorpaySubscriptionId: rzpSub.id }, 'geek', geekId);

  res.status(201).json({
    subscriptionId: rzpSub.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    plan,
    amount: PLANS[plan].amount,
  });
});

// Step 2: Frontend sends payment details after checkout → verify signature → activate
const verifyPaymentAndActivate = asyncHandler(async (req, res) => {
  const geekId = req.user._id;
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return res.status(400).json({ message: 'Payment details incomplete' });
  }

  // Verify Razorpay signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ message: 'Payment verification failed: signature mismatch' });
  }

  const sub = await Subscription.findOne({ razorpaySubscriptionId: razorpay_subscription_id, geek: geekId });
  if (!sub) return res.status(404).json({ message: 'Subscription record not found' });

  const geek = await Geek.findById(geekId);
  const { oldPlan } = await activatePlan(geek, sub, sub.plan, razorpay_payment_id);

  await log(geekId, 'payment_success', null, null, { razorpay_payment_id, razorpay_subscription_id }, 'razorpay');
  await log(geekId, 'plan_activated', oldPlan, sub.plan, {}, 'razorpay');

  if (sub.plan === 'Professional') {
    await log(geekId, 'badge_added', false, true, { plan: 'Professional' }, 'system');
  }

  res.status(200).json({ message: 'Subscription activated', plan: sub.plan, status: sub.status });
});

// ─── Cancel ───────────────────────────────────────────────────────────────────

const cancelSubscription = asyncHandler(async (req, res) => {
  const geekId = req.user._id;

  const sub = await Subscription.findOne({ geek: geekId, status: 'active' });
  if (!sub) return res.status(404).json({ message: 'No active subscription found' });

  // Cancel in Razorpay at end of current cycle
  if (sub.razorpaySubscriptionId) {
    await getRazorpay().subscriptions.cancel(sub.razorpaySubscriptionId, { cancel_at_cycle_end: 1 });
  }

  sub.cancelAtPeriodEnd = true;
  sub.pendingPlan = 'Startup';
  await sub.save();

  await log(
    geekId, 'plan_cancelled', sub.plan, 'Startup',
    { effectiveDate: sub.currentPeriodEnd, razorpaySubscriptionId: sub.razorpaySubscriptionId },
    'geek', geekId
  );

  res.status(200).json({
    message: `Subscription cancelled. You keep ${sub.plan} benefits until ${sub.currentPeriodEnd?.toDateString()}.`,
    effectiveDate: sub.currentPeriodEnd,
  });
});

// ─── Change Plan ──────────────────────────────────────────────────────────────

const changePlan = asyncHandler(async (req, res) => {
  const geekId = req.user._id;
  const { newPlan } = req.body;

  if (!newPlan || !['Startup', 'Advance', 'Professional'].includes(newPlan)) {
    return res.status(400).json({ message: 'Invalid plan' });
  }

  const geek = await Geek.findById(geekId);
  if (!geek) return res.status(404).json({ message: 'Geek not found' });

  const sub = await Subscription.findOne({ geek: geekId, status: 'active' });
  if (!sub) return res.status(404).json({ message: 'No active subscription found' });

  const planRank = { Startup: 0, Advance: 1, Professional: 2 };
  const isUpgrade = planRank[newPlan] > planRank[sub.plan];
  const isDowngrade = planRank[newPlan] < planRank[sub.plan];

  if (!isUpgrade && !isDowngrade) {
    return res.status(400).json({ message: 'Already on this plan' });
  }

  if (isUpgrade) {
    if (newPlan === 'Startup') {
      return res.status(400).json({ message: 'Cannot upgrade to Startup' });
    }

    const planId = PLANS[newPlan].razorpayPlanId();
    if (!planId) return res.status(500).json({ message: `Razorpay plan ID for ${newPlan} not configured` });

    // Cancel current Razorpay subscription and create a new one on the higher plan
    if (sub.razorpaySubscriptionId) {
      try { await getRazorpay().subscriptions.cancel(sub.razorpaySubscriptionId, { cancel_at_cycle_end: 0 }); } catch (_) {}
    }

    const rzpSub = await getRazorpay().subscriptions.create({
      plan_id: planId,
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      notes: { geekId: geekId.toString(), plan: newPlan },
    });

    sub.plan = newPlan;
    sub.status = 'created';
    sub.razorpaySubscriptionId = rzpSub.id;
    sub.cancelAtPeriodEnd = false;
    sub.pendingPlan = undefined;
    await sub.save();

    await log(geekId, 'plan_upgraded', geek.subscriptionPlan, newPlan, { razorpaySubscriptionId: rzpSub.id }, 'geek', geekId);

    const oldBadge = geek.subscriptionPlan === 'Professional';
    const newBadge = newPlan === 'Professional';
    if (!oldBadge && newBadge) {
      await log(geekId, 'badge_added', false, true, {}, 'system');
    }

    return res.status(200).json({
      message: `Upgrade to ${newPlan} initiated. Complete payment to activate.`,
      subscriptionId: rzpSub.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      plan: newPlan,
      amount: PLANS[newPlan].amount,
    });
  }

  // Downgrade — takes effect at end of current period
  if (newPlan !== 'Startup' && sub.razorpaySubscriptionId) {
    const planId = PLANS[newPlan].razorpayPlanId();
    if (!planId) return res.status(500).json({ message: `Razorpay plan ID for ${newPlan} not configured` });
    // Razorpay doesn't support mid-cycle plan changes; we cancel and let the webhook handle reactivation on Startup
    await getRazorpay().subscriptions.cancel(sub.razorpaySubscriptionId, { cancel_at_cycle_end: 1 });
  } else if (newPlan === 'Startup' && sub.razorpaySubscriptionId) {
    await getRazorpay().subscriptions.cancel(sub.razorpaySubscriptionId, { cancel_at_cycle_end: 1 });
  }

  sub.pendingPlan = newPlan;
  sub.cancelAtPeriodEnd = true;
  await sub.save();

  await log(
    geekId, 'plan_downgraded', sub.plan, newPlan,
    { effectiveDate: sub.currentPeriodEnd },
    'geek', geekId
  );

  return res.status(200).json({
    message: `Downgrade to ${newPlan} scheduled. Your current plan stays active until ${sub.currentPeriodEnd?.toDateString()}.`,
    effectiveDate: sub.currentPeriodEnd,
  });
});

// ─── Read ──────────────────────────────────────────────────────────────────────

const getMySubscription = asyncHandler(async (req, res) => {
  const geekId = req.user._id;

  const sub = await Subscription.findOne({ geek: geekId, status: { $in: ['active', 'created', 'paused'] } });

  if (!sub) {
    return res.status(200).json({ plan: 'Startup', status: 'none' });
  }

  res.status(200).json(sub);
});

const getSubscriptionHistory = asyncHandler(async (req, res) => {
  const geekId = req.user._id;

  const [subs, logs] = await Promise.all([
    Subscription.find({ geek: geekId }).sort({ createdAt: -1 }),
    AuditLog.find({ geek: geekId }).sort({ createdAt: -1 }),
  ]);

  res.status(200).json({ subscriptions: subs, auditLogs: logs });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

const getAllSubscriptionsAdmin = asyncHandler(async (req, res) => {
  const { status, plan, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (plan) query.plan = plan;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [subs, total] = await Promise.all([
    Subscription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('geek', 'fullName mobile subscriptionPlan'),
    Subscription.countDocuments(query),
  ]);

  res.status(200).json({ subscriptions: subs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

const getGeekSubscriptionAdmin = asyncHandler(async (req, res) => {
  const { geekId } = req.params;

  const [subs, logs] = await Promise.all([
    Subscription.find({ geek: geekId }).sort({ createdAt: -1 }),
    AuditLog.find({ geek: geekId }).sort({ createdAt: -1 }),
  ]);

  res.status(200).json({ subscriptions: subs, auditLogs: logs });
});

// ─── Razorpay Webhook ─────────────────────────────────────────────────────────

const handleWebhook = asyncHandler(async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  // req.body is a raw Buffer here (registered with express.raw in index.js)
  const rawBody = req.body.toString('utf8');

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature !== signature) {
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  const { event, payload } = JSON.parse(rawBody);
  const rzpSub = payload?.subscription?.entity;
  const rzpPayment = payload?.payment?.entity;

  if (!rzpSub) return res.status(200).json({ received: true });

  const sub = await Subscription.findOne({ razorpaySubscriptionId: rzpSub.id });
  if (!sub) return res.status(200).json({ received: true });

  const geek = await Geek.findById(sub.geek);
  if (!geek) return res.status(200).json({ received: true });

  switch (event) {
    case 'subscription.charged': {
      // Successful auto-renewal
      const { oldPlan } = await activatePlan(geek, sub, sub.plan, rzpPayment?.id);
      await log(sub.geek, 'payment_success', null, null, { razorpay_payment_id: rzpPayment?.id, renewal: true }, 'razorpay');
      await log(sub.geek, 'subscription_renewed', oldPlan, sub.plan, {}, 'razorpay');
      break;
    }

    case 'payment.failed': {
      sub.failedPaymentCount = (sub.failedPaymentCount || 0) + 1;
      sub.lastFailedPaymentAt = new Date();
      await sub.save();

      const retryCount = sub.failedPaymentCount;
      const retryAction = retryCount <= 3 ? `payment_retry_${retryCount}` : 'payment_failed';

      await log(
        sub.geek, retryAction, null, null,
        { attempt: retryCount, errorCode: rzpPayment?.error_code, errorDescription: rzpPayment?.error_description },
        'razorpay'
      );

      // Pause plan on day 4 (4th failure)
      if (retryCount >= 4) {
        const oldPlan = geek.subscriptionPlan;
        sub.status = 'paused';
        sub.pausedAt = new Date();
        await sub.save();

        geek.subscriptionPlan = 'Startup';
        await geek.save();

        await log(sub.geek, 'plan_paused', oldPlan, 'Startup', { failedPaymentCount: retryCount }, 'system');
        if (oldPlan === 'Professional') {
          await log(sub.geek, 'badge_removed', true, false, { reason: 'payment_failure' }, 'system');
        }
      }
      break;
    }

    case 'subscription.halted': {
      // Razorpay exhausted all retries — cancel subscription
      const oldPlan = geek.subscriptionPlan;
      sub.status = 'cancelled';
      sub.cancelledAt = new Date();
      await sub.save();

      geek.subscriptionPlan = 'Startup';
      geek.subscription = null;
      await geek.save();

      await log(sub.geek, 'subscription_halted', oldPlan, 'Startup', { razorpaySubscriptionId: rzpSub.id }, 'razorpay');
      if (oldPlan === 'Professional') {
        await log(sub.geek, 'badge_removed', true, false, { reason: 'subscription_halted' }, 'system');
      }
      break;
    }

    case 'subscription.cancelled': {
      const oldPlan = geek.subscriptionPlan;
      sub.status = 'cancelled';
      sub.cancelledAt = new Date();
      await sub.save();

      // Apply pending downgrade or revert to Startup
      const finalPlan = sub.pendingPlan || 'Startup';
      geek.subscriptionPlan = finalPlan;
      if (finalPlan === 'Startup') geek.subscription = null;
      await geek.save();

      await log(sub.geek, 'plan_cancelled', oldPlan, finalPlan, {}, 'razorpay');
      if (oldPlan === 'Professional' && finalPlan !== 'Professional') {
        await log(sub.geek, 'badge_removed', true, false, { reason: 'cancellation' }, 'system');
      }
      break;
    }

    default:
      break;
  }

  res.status(200).json({ received: true });
});

module.exports = {
  createSubscription,
  verifyPaymentAndActivate,
  cancelSubscription,
  changePlan,
  getMySubscription,
  getSubscriptionHistory,
  getAllSubscriptionsAdmin,
  getGeekSubscriptionAdmin,
  handleWebhook,
};
