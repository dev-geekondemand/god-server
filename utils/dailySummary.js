const { Geek } = require('../models/geekModel.js');
const User = require('../models/seekerModel.js');
const ServiceRequest = require('../models/ServiceRequest.js');
const AuditLog = require('../models/auditLogModel.js');
const Admin = require('../models/adminModel.js');
const sendMail = require('../middlewares/sendMail');
const { dailySummaryEmail } = require('./dashboardEmails.js');

function yesterdayRange() {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

async function buildYesterdaySummary() {
  const { start, end } = yesterdayRange();
  const range = { $gte: start, $lte: end };

  const [newGeeks, newSeekers, requestsRaised, requestsCompleted, requestsDropped, grossData, refundedData] =
    await Promise.all([
      Geek.countDocuments({ createdAt: range }),
      User.countDocuments({ createdAt: range }),
      ServiceRequest.countDocuments({ createdAt: range }),
      ServiceRequest.countDocuments({ status: 'Completed', updatedAt: range }),
      ServiceRequest.countDocuments({ status: { $in: ['Rejected', 'Cancelled'] }, updatedAt: range }),
      AuditLog.aggregate([
        { $match: { action: 'payment_success', createdAt: range, 'metadata.amount': { $exists: true } } },
        { $group: { _id: null, total: { $sum: '$metadata.amount' } } },
      ]),
      AuditLog.aggregate([
        { $match: { action: 'refund_issued', createdAt: range, 'metadata.amount': { $exists: true } } },
        { $group: { _id: null, total: { $sum: '$metadata.amount' } } },
      ]),
    ]);

  const grossPaise = grossData[0]?.total ?? 0;
  const refundedPaise = refundedData[0]?.total ?? 0;

  return {
    dateLabel: start.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
    newGeeks,
    newSeekers,
    requestsRaised,
    requestsCompleted,
    requestsDropped,
    revenueNetPaise: grossPaise - refundedPaise,
  };
}

async function sendDailySummaryEmails() {
  const summary = await buildYesterdaySummary();
  const admins = await Admin.find({});

  let sent = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    try {
      await sendMail(dailySummaryEmail(admin, summary));
      sent += 1;
    } catch (err) {
      console.error(`[dailySummary] Email failed for admin ${admin._id}:`, err.message);
    }
  }

  console.log(`[dailySummary] Sent to ${sent} admin(s) for ${summary.dateLabel}`);
}

module.exports = { buildYesterdaySummary, sendDailySummaryEmails };
