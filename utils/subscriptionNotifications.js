const twilioClient = require('../config/twilio.js');

// Total charged per month, inclusive of 18% GST
const PLAN_AMOUNTS = { Advance: '588.82', Professional: '1178.82' };

async function sendSubscriptionSMS(geek, plan, isRenewal = false) {
  if (!geek?.mobile) return;

  const mobile = geek.mobile.startsWith('+') ? geek.mobile : `+91${geek.mobile}`;
  const amount = PLAN_AMOUNTS[plan] ?? '';
  const action = isRenewal ? 'renewed' : 'activated';

  await twilioClient.messages.create({
    body: `GeekOnDemand: Your ${plan} plan has been ${action}. Amount charged: Rs.${amount}/month (incl. 18% GST). Manage at geekondemand.in`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: mobile,
  });
}

async function sendRefundProcessedSMS(geek, amountPaise) {
  if (!geek?.mobile) return;

  const mobile = geek.mobile.startsWith('+') ? geek.mobile : `+91${geek.mobile}`;
  const amount = (amountPaise / 100).toFixed(2);

  await twilioClient.messages.create({
    body: `GeekOnDemand: Your refund of Rs.${amount} has been processed and should reflect in your account within a few business days.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: mobile,
  });
}

module.exports = { sendSubscriptionSMS, sendRefundProcessedSMS };
