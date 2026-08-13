const asyncHandler = require('express-async-handler');
const ProfileAuditLog = require('../models/profileAuditLogModel');
const { PROFILE_AUDIT_ACTIONS } = require('../models/profileAuditLogModel');
const Seeker = require('../models/seekerModel');
const { Geek } = require('../models/geekModel');

const buildDateRange = (query) => {
  const start = query.startDate ? new Date(query.startDate) : null;
  const end = query.endDate ? new Date(query.endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Builds the Mongo match filter shared by the list and CSV export endpoints.
// Query params: role, action, search, startDate, endDate, archived
const buildAuditMatch = async (query) => {
  const match = {};

  if (query.archived === 'true') match.archived = true;
  else if (query.archived !== 'all') match.archived = false;

  if (query.role === 'Seeker' || query.role === 'Geek') match.role = query.role;

  if (query.action && PROFILE_AUDIT_ACTIONS.includes(query.action)) match.action = query.action;

  const { start, end } = buildDateRange(query);
  if (start || end) {
    match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
  }

  if (query.search) {
    const regex = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [matchingSeekers, matchingGeeks] = await Promise.all([
      Seeker.find({ $or: [{ 'fullName.first': regex }, { 'fullName.last': regex }, { email: regex }, { phone: regex }] }).select('_id').lean(),
      Geek.find({ $or: [{ 'fullName.first': regex }, { 'fullName.last': regex }, { email: regex }, { mobile: regex }] }).select('_id').lean(),
    ]);
    match.userId = { $in: [...matchingSeekers, ...matchingGeeks].map((u) => u._id) };
  }

  return match;
};

// Joins raw audit log docs against Seeker/Geek to attach display info.
const attachUserInfo = async (logs) => {
  const seekerIds = logs.filter((l) => l.role === 'Seeker').map((l) => l.userId);
  const geekIds = logs.filter((l) => l.role === 'Geek').map((l) => l.userId);

  const [seekers, geeks] = await Promise.all([
    Seeker.find({ _id: { $in: seekerIds } }).select('fullName email phone').lean(),
    Geek.find({ _id: { $in: geekIds } }).select('fullName email mobile').lean(),
  ]);

  const seekerMap = Object.fromEntries(seekers.map((s) => [s._id.toString(), s]));
  const geekMap = Object.fromEntries(geeks.map((g) => [g._id.toString(), g]));

  return logs.map((log) => {
    const user = log.role === 'Seeker' ? seekerMap[log.userId?.toString()] : geekMap[log.userId?.toString()];
    return {
      _id: log._id,
      userId: log.userId,
      userType: log.role,
      name: user ? `${user.fullName?.first || ''} ${user.fullName?.last || ''}`.trim() : 'Unknown',
      email: user?.email || '',
      phone: log.role === 'Seeker' ? (user?.phone || '') : (user?.mobile || ''),
      action: log.action,
      changes: log.changes || [],
      performedBy: log.performedBy,
      archived: log.archived,
      archivedAt: log.archivedAt || null,
      createdAt: log.createdAt,
    };
  });
};

// ---------------------------------------------------------------------------
// GET /api/admin/profileaudit/summary
// ---------------------------------------------------------------------------
const getProfileAuditSummary = asyncHandler(async (req, res) => {
  const [totalChanges, byRole, byAction, archivedChanges] = await Promise.all([
    ProfileAuditLog.countDocuments({ archived: false }),
    ProfileAuditLog.aggregate([{ $match: { archived: false } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    ProfileAuditLog.aggregate([{ $match: { archived: false } }, { $group: { _id: '$action', count: { $sum: 1 } } }]),
    ProfileAuditLog.countDocuments({ archived: true }),
  ]);

  const seekerChanges = byRole.find((r) => r._id === 'Seeker')?.count ?? 0;
  const geekChanges = byRole.find((r) => r._id === 'Geek')?.count ?? 0;

  const changesByAction = {};
  byAction.forEach(({ _id, count }) => { changesByAction[_id] = count; });

  res.status(200).json({
    totalChanges,
    seekerChanges,
    geekChanges,
    archivedChanges,
    changesByAction,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/profileaudit/list
// Query params: role, action, search, startDate, endDate, archived, page, limit
// ---------------------------------------------------------------------------
const getProfileAuditList = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const match = await buildAuditMatch(req.query);

  const [total, logs] = await Promise.all([
    ProfileAuditLog.countDocuments(match),
    ProfileAuditLog.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  const data = await attachUserInfo(logs);

  res.status(200).json({
    data,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/profileaudit/user/:userId?role=Seeker|Geek
// ---------------------------------------------------------------------------
const getUserProfileHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.query;

  if (role !== 'Seeker' && role !== 'Geek') {
    return res.status(400).json({ message: 'role query param must be "Seeker" or "Geek"' });
  }

  const [user, logs] = await Promise.all([
    role === 'Seeker'
      ? Seeker.findById(userId).select('fullName email phone address createdAt').lean()
      : Geek.findById(userId).select('fullName email mobile address createdAt').lean(),
    ProfileAuditLog.find({ userId, role }).sort({ createdAt: -1 }).lean(),
  ]);

  if (!user) return res.status(404).json({ message: 'User not found' });

  res.status(200).json({
    user: {
      _id: user._id,
      userType: role,
      name: `${user.fullName?.first || ''} ${user.fullName?.last || ''}`.trim(),
      email: user.email || '',
      phone: role === 'Seeker' ? (user.phone || '') : (user.mobile || ''),
      city: user.address?.city || '',
      registeredOn: user.createdAt,
    },
    history: logs.map((l) => ({
      _id: l._id,
      action: l.action,
      changes: l.changes || [],
      performedBy: l.performedBy,
      archived: l.archived,
      archivedAt: l.archivedAt || null,
      createdAt: l.createdAt,
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/profileaudit/archive
// Body: { olderThan: ISODateString } OR { ids: [logId, ...] }
// ---------------------------------------------------------------------------
const archiveProfileAuditLogs = asyncHandler(async (req, res) => {
  const { olderThan, ids } = req.body;
  const archivedAt = new Date();

  let filter;
  if (Array.isArray(ids) && ids.length > 0) {
    filter = { _id: { $in: ids }, archived: false };
  } else if (olderThan) {
    const cutoff = new Date(olderThan);
    if (Number.isNaN(cutoff.getTime())) {
      return res.status(400).json({ message: 'Invalid "olderThan" date' });
    }
    filter = { createdAt: { $lte: cutoff }, archived: false };
  } else {
    return res.status(400).json({ message: 'Provide either "ids" or "olderThan"' });
  }

  const result = await ProfileAuditLog.updateMany(filter, { $set: { archived: true, archivedAt } });

  res.status(200).json({
    message: 'Logs archived',
    matched: result.matchedCount ?? result.n,
    modified: result.modifiedCount ?? result.nModified,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/profileaudit/export
// Same filters as /list, returns CSV (one row per changed field)
// ---------------------------------------------------------------------------
const escapeCsvValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const exportProfileAuditLogsCsv = asyncHandler(async (req, res) => {
  const match = await buildAuditMatch(req.query);
  const logs = await ProfileAuditLog.find(match).sort({ createdAt: -1 }).lean();
  const entries = await attachUserInfo(logs);

  const header = ['Entity', 'Name', 'Email', 'Action', 'Field', 'Old Value', 'New Value', 'Performed By', 'Date'];
  const rows = [header.join(',')];

  entries.forEach((entry) => {
    const changeRows = entry.changes.length > 0 ? entry.changes : [{ field: '', oldValue: '', newValue: '' }];
    changeRows.forEach((change) => {
      rows.push(
        [
          entry.userType,
          entry.name,
          entry.email,
          entry.action,
          change.field,
          change.oldValue,
          change.newValue,
          entry.performedBy,
          new Date(entry.createdAt).toISOString(),
        ]
          .map(escapeCsvValue)
          .join(',')
      );
    });
  });

  const csv = rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="profile-audit-logs-${Date.now()}.csv"`);
  res.status(200).send(csv);
});

module.exports = {
  getProfileAuditSummary,
  getProfileAuditList,
  getUserProfileHistory,
  archiveProfileAuditLogs,
  exportProfileAuditLogsCsv,
};
