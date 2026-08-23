const asyncHandler = require('express-async-handler');
const { Geek } = require('../models/geekModel.js');
const Subscription = require('../models/subscriptionModel.js');
const Refund = require('../models/refundModel.js');
const AuditLog = require('../models/auditLogModel.js');
const { getRazorpay, PLANS } = require('./subscriptionController.js');
const { sendRefundProcessedSMS } = require('../utils/subscriptionNotifications.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function log(geekId, action, oldValue, newValue, metadata = {}, performedBy = 'system', performedById = null) {
  await AuditLog.create({ geek: geekId, action, oldValue, newValue, metadata, performedBy, performedById });
}

// ─── Geek: request a refund ────────────────────────────────────────────────────

const requestRefund = asyncHandler(async (req, res) => {
  const geekId = req.user._id;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'A reason is required to request a refund.' });
  }

  const sub = await Subscription.findOne({ geek: geekId, status: { $in: ['active', 'created', 'paused'] } });
  if (!sub) return res.status(404).json({ message: 'No subscription found.' });

  if (!sub.razorpayPaymentId) {
    return res.status(400).json({ message: 'No completed payment to refund on this subscription.' });
  }

  if (!PLANS[sub.plan]) {
    return res.status(400).json({ message: 'This plan has no billable amount to refund.' });
  }

  const openExisting = await Refund.findOne({
    subscription: sub._id,
    status: { $in: ['requested', 'processing'] },
  });
  if (openExisting) {
    return res.status(409).json({ message: 'You already have a refund request in progress for this subscription.' });
  }

  const refund = await Refund.create({
    subscription: sub._id,
    geek: geekId,
    razorpayPaymentId: sub.razorpayPaymentId,
    plan: sub.plan,
    amount: PLANS[sub.plan].amount,
    reason: reason.trim(),
    status: 'requested',
  });

  await log(geekId, 'refund_requested', null, refund.amount, { refundId: refund._id, reason: refund.reason }, 'geek', geekId);

  res.status(201).json(refund);
});

// ─── Admin: list ────────────────────────────────────────────────────────────────

const getAllRefundRequestsAdmin = asyncHandler(async (req, res) => {
  const { status, plan, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (plan) query.plan = plan;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [refunds, total] = await Promise.all([
    Refund.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('geek', 'fullName mobile')
      .populate('processedBy', 'name email'),
    Refund.countDocuments(query),
  ]);

  res.status(200).json({ refunds, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ─── Admin: process (trigger the Razorpay refund) ──────────────────────────────

const processRefundAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const refund = await Refund.findById(id);
  if (!refund) return res.status(404).json({ message: 'Refund request not found.' });

  if (!['requested', 'failed'].includes(refund.status)) {
    return res.status(400).json({ message: `Cannot process a refund with status "${refund.status}".` });
  }

  let rzpRefund;
  try {
    rzpRefund = await getRazorpay().payments.refund(refund.razorpayPaymentId, {
      amount: refund.amount,
      speed: 'normal',
      notes: { refundId: refund._id.toString() },
    });
  } catch (rzpErr) {
    const description = rzpErr?.error?.description || rzpErr?.message || 'Razorpay error';
    console.error('[Razorpay] payments.refund failed:', JSON.stringify(rzpErr));

    refund.status = 'failed';
    refund.adminNote = description;
    refund.processedBy = req.admin._id;
    await refund.save();

    await log(refund.geek, 'refund_failed', null, null, { refundId: refund._id, errorDescription: description }, 'admin', req.admin._id);

    return res.status(502).json({ message: `Payment gateway error: ${description}`, refund });
  }

  refund.razorpayRefundId = rzpRefund.id;
  refund.processedBy = req.admin._id;
  refund.status = rzpRefund.status === 'processed' ? 'processed' : 'processing';
  if (refund.status === 'processed') refund.processedAt = new Date();
  await refund.save();

  await log(
    refund.geek, 'refund_issued', null, refund.amount,
    { refundId: refund._id, razorpayRefundId: rzpRefund.id, amount: refund.amount, status: refund.status },
    'admin', req.admin._id
  );

  if (refund.status === 'processed') {
    const geek = await Geek.findById(refund.geek);
    if (geek) sendRefundProcessedSMS(geek, refund.amount).catch(() => {});
  }

  res.status(200).json(refund);
});

// ─── Admin: reject ──────────────────────────────────────────────────────────────

const rejectRefundAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'A reason is required to reject a refund request.' });
  }

  const refund = await Refund.findById(id);
  if (!refund) return res.status(404).json({ message: 'Refund request not found.' });

  if (refund.status !== 'requested') {
    return res.status(400).json({ message: `Cannot reject a refund with status "${refund.status}".` });
  }

  refund.status = 'rejected';
  refund.adminNote = reason.trim();
  refund.processedBy = req.admin._id;
  refund.processedAt = new Date();
  await refund.save();

  await log(refund.geek, 'refund_rejected', null, null, { refundId: refund._id, reason: refund.adminNote }, 'admin', req.admin._id);

  res.status(200).json(refund);
});

module.exports = {
  requestRefund,
  getAllRefundRequestsAdmin,
  processRefundAdmin,
  rejectRefundAdmin,
};
