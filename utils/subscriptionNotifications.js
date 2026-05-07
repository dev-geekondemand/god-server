const twilioClient = require('../config/twilio.js');

const PLAN_AMOUNTS = { Advance: 499, Professional: 999 };

async function sendSubscriptionSMS(geek, plan, isRenewal = false) {
  if (!geek?.mobile) return;

  const mobile = geek.mobile.startsWith('+') ? geek.mobile : `+91${geek.mobile}`;
  const amount = PLAN_AMOUNTS[plan] ?? '';
  const action = isRenewal ? 'renewed' : 'activated';

  await twilioClient.messages.create({
    body: `GeekOnDemand: Your ${plan} plan has been ${action}. Amount charged: Rs.${amount}/month. Manage at geekondemand.in`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: mobile,
  });
}

module.exports = { sendSubscriptionSMS };
