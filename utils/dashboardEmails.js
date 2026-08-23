const dailySummaryEmail = (admin, summary) => ({
  to: admin.email,
  subject: `GeekOnDemand daily summary — ${summary.dateLabel}`,
  text: `Hello ${admin.name || 'Admin'},\n\nHere's yesterday's summary (${summary.dateLabel}):\n\n` +
    `- New Geeks: ${summary.newGeeks}\n- New Seekers: ${summary.newSeekers}\n` +
    `- Requests raised: ${summary.requestsRaised}\n- Requests completed: ${summary.requestsCompleted}\n` +
    `- Requests dropped (rejected/cancelled): ${summary.requestsDropped}\n` +
    `- Revenue collected: ₹${(summary.revenueNetPaise / 100).toFixed(0)}\n\n` +
    `View the full dashboard for more detail.\n\n- GeekOnDemand`,
});

module.exports = { dailySummaryEmail };
