const asyncHandler = require('express-async-handler');
const LoginEvent   = require('../models/LoginEvent');
const Seeker       = require('../models/seekerModel');
const { Geek }     = require('../models/geekModel');

const buildDateRange = (query) => {
  let start, end;
  if (query.startDate || query.endDate) {
    start = query.startDate ? new Date(query.startDate) : new Date('2000-01-01');
    end   = query.endDate   ? new Date(query.endDate)   : new Date();
    end.setHours(23, 59, 59, 999);
  } else {
    const year = query.year ? parseInt(query.year) : new Date().getFullYear();
    start = new Date(`${year}-01-01T00:00:00.000Z`);
    end   = new Date(`${year}-12-31T23:59:59.999Z`);
  }
  return { start, end };
};

const buildGroupId = (groupBy, dateField = '$createdAt') => {
  switch (groupBy) {
    case 'year':
      return { year: { $year: dateField } };
    case 'quarter':
      return {
        year:    { $year: dateField },
        quarter: { $ceil: { $divide: [{ $month: dateField }, 3] } },
      };
    case 'month':
    default:
      return {
        year:  { $year: dateField },
        month: { $month: dateField },
      };
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/loginanalytics/summary
// ---------------------------------------------------------------------------
const getLoginSummary = asyncHandler(async (req, res) => {
  const [totalLogins, byRole, durationAgg] = await Promise.all([
    LoginEvent.countDocuments(),
    LoginEvent.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    LoginEvent.aggregate([
      { $match: { sessionDuration: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$sessionDuration' } } },
    ]),
  ]);

  const seekerLogins = byRole.find((r) => r._id === 'Seeker')?.count ?? 0;
  const geekLogins   = byRole.find((r) => r._id === 'Geek')?.count   ?? 0;

  const loginsByStatus = {};
  byRole.forEach(({ _id, count }) => { loginsByStatus[_id] = count; });

  const avgLoginDuration = durationAgg[0]?.avg ?? null;

  res.status(200).json({
    totalLogins,
    seekerLogins,
    geekLogins,
    failedLogins: 0,
    avgLoginDuration,
    loginsByStatus,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/loginanalytics/seekers
// ---------------------------------------------------------------------------
const getSeekerLoginsOverTime = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const groupBy = req.query.groupBy || 'month';
  const groupId = buildGroupId(groupBy);

  const data = await LoginEvent.aggregate([
    { $match: { role: 'Seeker', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.quarter': 1 } },
    { $project: { _id: 0, period: '$_id', count: 1 } },
  ]);

  res.status(200).json({
    groupBy,
    range: { from: start, to: end },
    total: data.reduce((sum, d) => sum + d.count, 0),
    data,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/loginanalytics/geeks
// ---------------------------------------------------------------------------
const getGeekLoginsOverTime = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const groupBy = req.query.groupBy || 'month';
  const groupId = buildGroupId(groupBy);

  const data = await LoginEvent.aggregate([
    { $match: { role: 'Geek', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.quarter': 1 } },
    { $project: { _id: 0, period: '$_id', count: 1 } },
  ]);

  res.status(200).json({
    groupBy,
    range: { from: start, to: end },
    total: data.reduce((sum, d) => sum + d.count, 0),
    data,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/loginanalytics/list
// Query params: startDate, endDate, page, limit
// ---------------------------------------------------------------------------
const getUserLoginsList = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  // Aggregate login events → one entry per unique user with stats
  const userStats = await LoginEvent.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id:             { userId: '$userId', role: '$role' },
        totalLogins:     { $sum: 1 },
        lastLogin:       { $max: '$createdAt' },
        lastLogoutAt:    { $max: '$logoutAt' },
        avgSessionDuration: { $avg: '$sessionDuration' },
      },
    },
    { $sort: { lastLogin: -1 } },
  ]);

  const total     = userStats.length;
  const paginated = userStats.slice(skip, skip + limit);

  // Split by role so we can do targeted lookups
  const seekerIds = paginated.filter(u => u._id.role === 'Seeker').map(u => u._id.userId);
  const geekIds   = paginated.filter(u => u._id.role === 'Geek').map(u => u._id.userId);

  const [seekers, geeks] = await Promise.all([
    Seeker.find({ _id: { $in: seekerIds } })
      .select('fullName email phone address refCode createdAt')
      .lean(),
    Geek.find({ _id: { $in: geekIds } })
      .select('fullName email mobile address refCode createdAt')
      .lean(),
  ]);

  const seekerMap = Object.fromEntries(seekers.map(s => [s._id.toString(), s]));
  const geekMap   = Object.fromEntries(geeks.map(g => [g._id.toString(), g]));

  const data = paginated.map(entry => {
    const { userId, role } = entry._id;
    const user = role === 'Seeker'
      ? seekerMap[userId.toString()]
      : geekMap[userId.toString()];

    return {
      _id:           userId,
      userType:      role,
      name:          user ? `${user.fullName?.first || ''} ${user.fullName?.last || ''}`.trim() : 'Unknown',
      email:         user?.email        || '',
      phone:         role === 'Seeker'  ? (user?.phone  || '') : (user?.mobile || ''),
      registeredOn:  user?.createdAt    || null,
      city:          user?.address?.city || '',
      refCode:       user?.refCode      || '',
      totalLogins:   entry.totalLogins,
      lastLogin:     entry.lastLogin,
      logoutAt:      entry.lastLogoutAt  || null,
      loginDuration: entry.avgSessionDuration != null ? Math.round(entry.avgSessionDuration) : null,
    };
  });

  res.status(200).json({
    data,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

module.exports = { getLoginSummary, getSeekerLoginsOverTime, getGeekLoginsOverTime, getUserLoginsList };
