const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Ticket = require('../models/ticketModel');
const Admin = require('../models/adminModel');
const sendMail = require('../middlewares/sendMail');
const { uploadToAzure } = require('../middlewares/azureUploads');
const { computeSlaDueDates } = require('../utils/ticketSla');
const resolveTicketActor = require('../utils/resolveTicketActor');
const {
  ticketCreatedEmail,
  ticketStatusUpdatedEmail,
  ticketResolvedEmail,
} = require('../utils/ticketEmails');

const uploadAttachments = async (files) => {
  if (!files?.length) return [];
  const uploaded = [];
  for (const file of files) {
    const result = await uploadToAzure(file);
    uploaded.push({
      public_id: result.public_id,
      url: result.url,
      filename: file.originalname,
      mimetype: file.mimetype,
    });
  }
  return uploaded;
};

const STATUS_TRANSITIONS = {
  Open: ['In Progress', 'Closed'],
  'In Progress': ['Awaiting Response', 'Resolved', 'Closed'],
  'Awaiting Response': ['In Progress', 'Resolved', 'Closed'],
  Resolved: ['Closed', 'In Progress'],
  Closed: ['In Progress'],
};

// ---------------------------------------------------------------------------
// Seeker / Geek endpoints — the authenticated actor may be either, resolved
// by looking up req.user.id against both collections (see resolveTicketActor).
// ---------------------------------------------------------------------------

const createTicket = asyncHandler(async (req, res) => {
  const { category, subject, description, relatedServiceRequest } = req.body;

  if (!category || !subject || !description) {
    return res.status(400).json({ message: 'category, subject and description are required' });
  }

  const { actor, actorModel } = await resolveTicketActor(req.user.id);
  if (!actor) return res.status(404).json({ message: 'Account not found' });

  const attachments = await uploadAttachments(req.files?.attachments);
  const initialPriority = category === 'Geek Conduct' ? 'High' : 'Medium';
  const createdAt = new Date();
  const sla = { ...computeSlaDueDates(initialPriority, createdAt), breached: false, escalated: false };

  const ticket = await Ticket.create({
    raisedBy: actor._id,
    raisedByModel: actorModel,
    category,
    subject,
    description,
    relatedServiceRequest: relatedServiceRequest || undefined,
    attachments,
    priority: initialPriority,
    sla,
    statusHistory: [
      { status: 'Open', changedBy: actor._id, changedByModel: actorModel, at: createdAt },
    ],
  });

  try {
    if (actor.email) await sendMail(ticketCreatedEmail(ticket, actor));
  } catch (err) {
    console.error(`[createTicket] Email failed for ticket ${ticket._id}:`, err.message);
  }

  res.status(201).json(ticket);
});

const getMyTickets = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  const match = { raisedBy: new mongoose.Types.ObjectId(req.user.id) };
  if (req.query.status) match.status = req.query.status;
  if (req.query.category) match.category = req.query.category;

  const [total, data] = await Promise.all([
    Ticket.countDocuments(match),
    Ticket.find(match).select('-internalNotes').sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);

  res.status(200).json({ data, total, page, pages: Math.ceil(total / limit) || 1 });
});

const getMyTicketById = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, raisedBy: req.user.id }).select('-internalNotes');
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  res.status(200).json(ticket);
});

const replyToTicketAsUser = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, raisedBy: req.user.id });
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

  const { body } = req.body;
  if (!body) return res.status(400).json({ message: 'Message body is required' });

  const attachments = await uploadAttachments(req.files?.attachments);

  ticket.messages.push({
    sender: req.user.id,
    senderModel: ticket.raisedByModel,
    body,
    attachments,
  });

  if (ticket.status === 'Awaiting Response') {
    ticket.status = 'In Progress';
    ticket.statusHistory.push({
      status: 'In Progress',
      changedBy: req.user.id,
      changedByModel: ticket.raisedByModel,
      note: 'Ticket raiser replied',
    });
  }

  await ticket.save();
  res.status(200).json(ticket);
});

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

const getTicketQueue = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const match = {};
  if (req.query.status) match.status = req.query.status;
  if (req.query.priority) match.priority = req.query.priority;
  if (req.query.category) match.category = req.query.category;
  if (req.query.raisedByModel) match.raisedByModel = req.query.raisedByModel;
  if (req.query.breached === 'true') match['sla.breached'] = true;
  if (req.query.assignedTo === 'unassigned') match.assignedTo = null;
  else if (req.query.assignedTo) match.assignedTo = req.query.assignedTo;
  if (req.query.search) {
    match.$or = [
      { subject: { $regex: req.query.search, $options: 'i' } },
      { ticketNumber: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [total, data] = await Promise.all([
    Ticket.countDocuments(match),
    Ticket.find(match)
      .populate('raisedBy', 'fullName email phone mobile')
      .populate('assignedTo', 'name email')
      .sort({ priority: -1, 'sla.resolutionDueAt': 1 })
      .skip(skip)
      .limit(limit),
  ]);

  res.status(200).json({ data, total, page, pages: Math.ceil(total / limit) || 1 });
});

const getTicketByIdAdmin = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate('raisedBy', 'fullName email phone mobile')
    .populate('assignedTo', 'name email')
    .populate('internalNotes.admin', 'name email');
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  res.status(200).json(ticket);
});

const assignTicket = asyncHandler(async (req, res) => {
  const { adminId } = req.body;
  const admin = await Admin.findById(adminId).select('name');
  if (!admin) return res.status(404).json({ message: 'Admin not found' });

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

  ticket.assignedTo = admin._id;
  if (ticket.status === 'Open') ticket.status = 'In Progress';
  ticket.statusHistory.push({
    status: ticket.status,
    changedBy: req.admin._id,
    changedByModel: 'Admin',
    note: `Assigned to ${admin.name}`,
  });

  await ticket.save();
  res.status(200).json(ticket);
});

const changeTicketPriority = asyncHandler(async (req, res) => {
  const { priority } = req.body;
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

  const previousPriority = ticket.priority;
  ticket.priority = priority;

  // Only recompute SLA deadlines if first response hasn't happened yet,
  // so we don't retroactively shrink a deadline the admin already met.
  if (!ticket.sla.firstRespondedAt) {
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDueDates(priority, ticket.createdAt);
    ticket.sla.firstResponseDueAt = firstResponseDueAt;
    ticket.sla.resolutionDueAt = resolutionDueAt;
  }

  ticket.statusHistory.push({
    status: ticket.status,
    changedBy: req.admin._id,
    changedByModel: 'Admin',
    note: `Priority changed from ${previousPriority} to ${priority}`,
  });

  await ticket.save();
  res.status(200).json(ticket);
});

const changeTicketStatus = asyncHandler(async (req, res) => {
  const { status, resolutionSummary } = req.body;
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

  const allowedNext = STATUS_TRANSITIONS[ticket.status] || [];
  if (!allowedNext.includes(status)) {
    return res.status(400).json({ message: `Cannot transition from ${ticket.status} to ${status}` });
  }

  if (status === 'Resolved' && !resolutionSummary) {
    return res.status(400).json({ message: 'resolutionSummary is required to resolve a ticket' });
  }

  const oldStatus = ticket.status;
  ticket.status = status;

  if (status === 'Resolved') {
    ticket.resolution = { summary: resolutionSummary, resolvedBy: req.admin._id };
    ticket.sla.resolvedAt = new Date();
  }

  ticket.statusHistory.push({
    status,
    changedBy: req.admin._id,
    changedByModel: 'Admin',
  });

  await ticket.save();

  try {
    const { actor } = await resolveTicketActor(ticket.raisedBy);
    if (actor?.email) {
      if (status === 'Resolved') {
        await sendMail(ticketResolvedEmail(ticket, actor));
      } else {
        await sendMail(ticketStatusUpdatedEmail(ticket, actor, oldStatus, status));
      }
    }
  } catch (err) {
    console.error(`[changeTicketStatus] Email failed for ticket ${ticket._id}:`, err.message);
  }

  res.status(200).json(ticket);
});

const addInternalNote = asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ message: 'note is required' });

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

  ticket.internalNotes.push({ admin: req.admin._id, note });
  await ticket.save();

  const populated = await ticket.populate('internalNotes.admin', 'name email');
  res.status(200).json(populated);
});

const replyToTicketAdmin = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

  const { body } = req.body;
  if (!body) return res.status(400).json({ message: 'Message body is required' });

  const attachments = await uploadAttachments(req.files?.attachments);

  ticket.messages.push({
    sender: req.admin._id,
    senderModel: 'Admin',
    body,
    attachments,
  });

  if (!ticket.sla.firstRespondedAt) {
    ticket.sla.firstRespondedAt = new Date();
  }
  if (ticket.status === 'Open') {
    ticket.status = 'In Progress';
    ticket.statusHistory.push({
      status: 'In Progress',
      changedBy: req.admin._id,
      changedByModel: 'Admin',
      note: 'Support team replied',
    });
  }

  await ticket.save();

  try {
    const { actor } = await resolveTicketActor(ticket.raisedBy);
    if (actor?.email) await sendMail(ticketStatusUpdatedEmail(ticket, actor, ticket.status, ticket.status));
  } catch (err) {
    console.error(`[replyToTicketAdmin] Email failed for ticket ${ticket._id}:`, err.message);
  }

  res.status(200).json(ticket);
});

const getTicketStats = asyncHandler(async (req, res) => {
  const [byStatus, byPriority, breachedCount, escalatedCount, resolvedAgg, createdPerDay] = await Promise.all([
    Ticket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Ticket.countDocuments({ 'sla.breached': true }),
    Ticket.countDocuments({ 'sla.escalated': true }),
    Ticket.aggregate([
      { $match: { 'sla.resolvedAt': { $ne: null } } },
      {
        $project: {
          resolutionHours: {
            $divide: [{ $subtract: ['$sla.resolvedAt', '$createdAt'] }, 1000 * 60 * 60],
          },
        },
      },
      { $group: { _id: null, avgHours: { $avg: '$resolutionHours' } } },
    ]),
    Ticket.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const toMap = (arr) => arr.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {});

  res.status(200).json({
    byStatus: toMap(byStatus),
    byPriority: toMap(byPriority),
    breachedCount,
    escalatedCount,
    avgResolutionHours: resolvedAgg[0]?.avgHours ?? null,
    createdPerDay: createdPerDay.map((d) => ({ date: d._id, count: d.count })),
  });
});

const listAssignableAdmins = asyncHandler(async (req, res) => {
  const admins = await Admin.find().select('name email').sort({ name: 1 });
  res.status(200).json(admins);
});

module.exports = {
  createTicket,
  getMyTickets,
  getMyTicketById,
  replyToTicketAsUser,
  getTicketQueue,
  getTicketByIdAdmin,
  assignTicket,
  changeTicketPriority,
  changeTicketStatus,
  addInternalNote,
  replyToTicketAdmin,
  getTicketStats,
  listAssignableAdmins,
};
