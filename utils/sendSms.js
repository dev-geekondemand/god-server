const twilioClient = require('../config/twilio.js');

async function sendSms(toPhoneRaw, body) {
  if (!toPhoneRaw) return;
  const to = toPhoneRaw.startsWith('+') ? toPhoneRaw : `+91${toPhoneRaw}`;
  await twilioClient.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to });
}

module.exports = { sendSms };
