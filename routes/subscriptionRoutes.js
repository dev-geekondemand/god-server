const express = require('express');
const {
  createSubscription,
  verifyPaymentAndActivate,
  cancelSubscription,
  changePlan,
  getMySubscription,
  getSubscriptionHistory,
  getAllSubscriptionsAdmin,
  getGeekSubscriptionAdmin,
  handleWebhook,
} = require('../controllers/subscriptionController.js');
const protectGeek = require('../middlewares/protectGeek.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');

const router = express.Router();

// NOTE: /webhook is registered directly in index.js before bodyParser so Razorpay's
// signature can be verified against the raw request body. Do not add it here.

// ─── Geek self-service ────────────────────────────────────────────────────────
router.post('/subscribe', protectGeek, createSubscription);
router.post('/verify', protectGeek, verifyPaymentAndActivate);
router.post('/cancel', protectGeek, cancelSubscription);
router.put('/change-plan', protectGeek, changePlan);
router.get('/me', protectGeek, getMySubscription);
router.get('/history', protectGeek, getSubscriptionHistory);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get('/admin/all', protectAdmin, getAllSubscriptionsAdmin);
router.get('/admin/geek/:geekId', protectAdmin, getGeekSubscriptionAdmin);

module.exports = router;
