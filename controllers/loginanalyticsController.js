const asyncHandler = require('express-async-handler');
const LoginEvent   = require('../models/LoginEvent');
const Seeker       = require('../models/seekerModel');
const { Geek }     = require('../models/geekModel');

const DAY_MS = 24 * 60 * 60 * 1000;

// startDate/endDate arrive as plain YYYY-MM-DD and are read as UTC days, so the
// result never depends on the server's local timezone. `end` is EXCLUSIVE — the
// midnight after the chosen end date — which keeps the whole end day in range.
// Callers must therefore match with `$lt: end`, not `$lte: end`.
const buildDateRange = (query) => {
  const parseDay = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const nextDay = (d) => new Date(d.getTime() + DAY_MS);
  const todayUTC = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  };

  const startDay = parseDay(query.startDate);
  const endDay   = parseDay(query.endDate);

  if (startDay || endDay) {
    return {
      start: startDay || new Date(Date.UTC(2000, 0, 1)),
      end:   nextDay(endDay || todayUTC()),
    };
  }

  const year = query.year ? parseInt(query.year) : new Date().getUTCFullYear();
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end:   new Date(Date.UTC(year + 1, 0, 1)),
  };
};

// `end` is exclusive internally; report it inclusively so a client that renders
// the range doesn't show a day more than the user asked for.
const describeRange = ({ start, end }) => ({ from: start, to: new Date(end.getTime() - 1) });

// Events written before `status` existed have no such field, and a schema
// default only applies to new documents — so "successful" is everything that
// isn't explicitly a failure. Matching `status: 'success'` would hide all
// historical logins.
const SUCCESS = { status: { $ne: 'failed' } };

const GROUP_BY_VALUES = ['day', 'month', 'quarter', 'year'];

const normalizeGroupBy = (value) =>
  GROUP_BY_VALUES.includes(value) ? value : 'month';

const buildGroupId = (groupBy, dateField = '$createdAt') => {
  switch (groupBy) {
    case 'year':
      return { year: { $year: dateField } };
    case 'quarter':
      return {
        year:    { $year: dateField },
        quarter: { $ceil: { $divide: [{ $month: dateField }, 3] } },
      };
    case 'day':
      return {
        year:  { $year: dateField },
        month: { $month: dateField },
        day:   { $dayOfMonth: dateField },
      };
    case 'month':
    default:
      return {
        year:  { $year: dateField },
        month: { $month: dateField },
      };
  }
};

// Successful logins grouped into periods over a date range — shared by the
// per-role time series so both buckets are built identically.
const loginsOverTime = async (role, query) => {
  const range = buildDateRange(query);
  const { start, end } = range;
  const groupBy = normalizeGroupBy(query.groupBy);

  const data = await LoginEvent.aggregate([
    { $match: { role, ...SUCCESS, createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: buildGroupId(groupBy), count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.quarter': 1, '_id.month': 1, '_id.day': 1 } },
    { $project: { _id: 0, period: '$_id', count: 1 } },
  ]);

  return {
    groupBy,
    range: describeRange(range),
    total: data.reduce((sum, d) => sum + d.count, 0),
    data,
  };
};

// ---------------------------------------------------------------------------
// GET /api/admin/loginanalytics/summary
// ---------------------------------------------------------------------------
const getLoginSummary = asyncHandler(async (req, res) => {
  const range = buildDateRange(req.query);
  const inRange = { createdAt: { $gte: range.start, $lt: range.end } };

  const [byRole, byStatus, durationAgg] = await Promise.all([
    // Role split counts successful logins only — a rejected attempt isn't a login.
    LoginEvent.aggregate([
      { $match: { ...inRange, ...SUCCESS } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    LoginEvent.aggregate([
      { $match: inRange },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    LoginEvent.aggregate([
      { $match: { ...inRange, ...SUCCESS, sessionDuration: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$sessionDuration' } } },
    ]),
  ]);

  const seekerLogins = byRole.find((r) => r._id === 'Seeker')?.count ?? 0;
  const geekLogins   = byRole.find((r) => r._id === 'Geek')?.count   ?? 0;

  // Same reasoning as SUCCESS above: anything not explicitly 'failed' is a success.
  const sumWhere = (predicate) =>
    byStatus.filter((s) => predicate(s._id)).reduce((sum, s) => sum + s.count, 0);

  const successfulLogins = sumWhere((id) => id !== 'failed');
  const failedLogins     = sumWhere((id) => id === 'failed');

  res.status(200).json({
    range: describeRange(range),
    totalLogins: successfulLogins,
    seekerLogins,
    geekLogins,
    failedLogins,
    avgLoginDuration: durationAgg[0]?.avg ?? null,
    loginsByStatus: { Successful: successfulLogins, Failed: failedLogins },
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/loginanalytics/seekers
// ---------------------------------------------------------------------------
const getSeekerLoginsOverTime = asyncHandler(async (req, res) => {
  res.status(200).json(await loginsOverTime('Seeker', req.query));
});

// ---------------------------------------------------------------------------
// GET /api/admin/loginanalytics/geeks
// ---------------------------------------------------------------------------
const getGeekLoginsOverTime = asyncHandler(async (req, res) => {
  res.status(200).json(await loginsOverTime('Geek', req.query));
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

  // Aggregate login events → one entry per unique user with stats.
  // Failed attempts are excluded: they may carry no userId and would collapse
  // into a single bogus "Unknown" row.
  const userStats = await LoginEvent.aggregate([
    { $match: { ...SUCCESS, userId: { $ne: null }, createdAt: { $gte: start, $lt: end } } },
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
