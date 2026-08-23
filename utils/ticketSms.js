const ticketStatusUpdatedSms = (ticket, newStatus) =>
  `GeekOnDemand: Your ticket ${ticket.ticketNumber} status changed to "${newStatus}".`;

const ticketResolvedSms = (ticket) =>
  `GeekOnDemand: Your ticket ${ticket.ticketNumber} has been resolved.`;

const ticketRepliedSms = (ticket) =>
  `GeekOnDemand: Support replied to your ticket ${ticket.ticketNumber}.`;

module.exports = { ticketStatusUpdatedSms, ticketResolvedSms, ticketRepliedSms };
