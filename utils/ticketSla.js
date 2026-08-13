const Ticket = require('../models/ticketModel');
const Admin = require('../models/adminModel');
const sendMail = require('../middlewares/sendMail');
const { slaBreachAlertEmail } = require('./ticketEmails');

// Simple, flat-hour SLA policy (not a business-hours calendar).
const SLA_POLICY_HOURS = {
  Urgent: { firstResponse: 2, resolution: 8 },
  High: { firstResponse: 4, resolution: 24 },
  Medium: { firstResponse: 8, resolution: 48 },
  Low: { firstResponse: 24, resolution: 96 },
};

const PRIORITY_ESCALATION_ORDER = ['Low', 'Medium', 'High', 'Urgent'];

const computeSlaDueDates = (priority, createdAt = new Date()) => {
  const policy = SLA_POLICY_HOURS[priority] || SLA_POLICY_HOURS.Medium;
  const base = new Date(createdAt).getTime();
  return {
    firstResponseDueAt: new Date(base + policy.firstResponse * 60 * 60 * 1000),
    resolutionDueAt: new Date(base + policy.resolution * 60 * 60 * 1000),
  };
};

const nextEscalatedPriority = (priority) => {
  const idx = PRIORITY_ESCALATION_ORDER.indexOf(priority);
  if (idx === -1 || idx === PRIORITY_ESCALATION_ORDER.length - 1) return priority;
  return PRIORITY_ESCALATION_ORDER[idx + 1];
};

const checkSlaBreaches = async () => {
  const now = new Date();

  const overdue = await Ticket.find({
    status: { $nin: ['Resolved', 'Closed'] },
    'sla.breached': { $ne: true },
    'sla.resolutionDueAt': { $lt: now },
  }).populate('assignedTo');

  for (const ticket of overdue) {
    const previousPriority = ticket.priority;
    ticket.sla.breached = true;
    ticket.sla.escalated = true;
    ticket.sla.escalatedAt = now;
    ticket.priority = nextEscalatedPriority(ticket.priority);
    ticket.statusHistory.push({
      status: ticket.status,
      changedByModel: 'System',
      note: `SLA breached — auto-escalated priority from ${previousPriority} to ${ticket.priority}`,
      at: now,
    });

    await ticket.save();

    try {
      const recipients = ticket.assignedTo ? [ticket.assignedTo] : await Admin.find();
      for (const admin of recipients) {
        if (!admin?.email) continue;
        await sendMail(slaBreachAlertEmail(ticket, admin));
      }
    } catch (err) {
      console.error(`[checkSlaBreaches] Email failed for ticket ${ticket._id}:`, err.message);
    }
  }

  console.log(`[checkSlaBreaches] Escalated ${overdue.length} ticket(s) at ${now.toISOString()}`);
};

module.exports = { computeSlaDueDates, checkSlaBreaches, SLA_POLICY_HOURS };
