// `actor` is whoever raised the ticket — a Seeker (User) or a Geek — both
// share the same fullName{first,last}/email shape, so no per-role branching
// is needed here.
const actorName = (actor) => actor?.fullName?.first || actor?.companyName || 'there';

const ticketCreatedEmail = (ticket, actor) => ({
  to: actor.email,
  subject: `We've received your support ticket ${ticket.ticketNumber}`,
  text: `Hello ${actorName(actor)},\n\nThanks for reaching out. We've received your ticket "${ticket.subject}" (${ticket.ticketNumber}) under ${ticket.category}. Our support team will get back to you shortly.\n\nBest regards,\nGeekOnDemand Support Team`,
});

const ticketStatusUpdatedEmail = (ticket, actor, oldStatus, newStatus) => ({
  to: actor.email,
  subject: `Update on your ticket ${ticket.ticketNumber}`,
  text: `Hello ${actorName(actor)},\n\nYour ticket "${ticket.subject}" (${ticket.ticketNumber}) has been updated from "${oldStatus}" to "${newStatus}".\n\nBest regards,\nGeekOnDemand Support Team`,
});

const ticketResolvedEmail = (ticket, actor) => ({
  to: actor.email,
  subject: `Your ticket ${ticket.ticketNumber} has been resolved`,
  text: `Hello ${actorName(actor)},\n\nYour ticket "${ticket.subject}" (${ticket.ticketNumber}) has been resolved.\n\nResolution: ${ticket.resolution?.summary || 'N/A'}\n\nIf this doesn't fully address your issue, feel free to reply to this ticket.\n\nBest regards,\nGeekOnDemand Support Team`,
});

const slaBreachAlertEmail = (ticket, admin) => ({
  to: admin.email,
  subject: `SLA breached — ticket ${ticket.ticketNumber} needs attention`,
  text: `Hello ${admin.name || 'Admin'},\n\nTicket ${ticket.ticketNumber} ("${ticket.subject}", category: ${ticket.category}, raised by: ${ticket.raisedByModel}) has breached its SLA resolution deadline and has been auto-escalated to priority ${ticket.priority}.\n\nPlease review it as soon as possible.\n\n- GeekOnDemand Support System`,
});

module.exports = {
  ticketCreatedEmail,
  ticketStatusUpdatedEmail,
  ticketResolvedEmail,
  slaBreachAlertEmail,
};
