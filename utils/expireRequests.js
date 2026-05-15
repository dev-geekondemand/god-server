const ServiceRequest = require('../models/ServiceRequest.js');
const client = require('../config/twilio');
const sendMail = require('../middlewares/sendMail');

const expireRequests = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const expired = await ServiceRequest.find({
    geekResponseStatus: 'Pending',
    status: { $in: ['Pending', 'Matched'] },
    createdAt: { $lt: cutoff },
  }).populate('seeker').populate('category');

  for (const request of expired) {
    request.status = 'Rejected';
    request.geekResponseStatus = 'Expired';
    await request.save();

    if (request?.seeker?.phone) {
      try {
        await client.messages.create({
          body: `Your request for ${request.category?.title || 'your service'} has expired due to no response from the selected Geek. Please create a new request with a different Geek.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: request.seeker.phone,
        });
      } catch (err) {
        console.error(`[expireRequests] SMS failed for request ${request._id}:`, err.message);
      }
    }
    if (request?.seeker?.email) {
      try {
        await sendMail({
          to: request.seeker.email,
          subject: 'Your Service Request Has Expired',
          text: `Hello ${request.seeker.name},\n\nYour request for ${request.category?.title || 'your service'} has expired due to no response from the selected Geek. Please create a new request with a different Geek.\n\nBest regards,\nGeekOnDemand Team`,
        });
      } catch (err) {
        console.error(`[expireRequests] Email failed for request ${request._id}:`, err.message);
      }
    }
  }

  console.log(`[expireRequests] Expired ${expired.length} request(s) at ${new Date().toISOString()}`);
};

module.exports = expireRequests;
