const asyncHandler = require('express-async-handler');
const LoginEvent   = require('../models/LoginEvent');

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
  const [totalLogins, byRole] = await Promise.all([
    LoginEvent.countDocuments(),
    LoginEvent.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
  ]);

  const seekerLogins = byRole.find((r) => r._id === 'Seeker')?.count ?? 0;
  const geekLogins   = byRole.find((r) => r._id === 'Geek')?.count   ?? 0;

  const loginsByStatus = {};
  byRole.forEach(({ _id, count }) => { loginsByStatus[_id] = count; });

  res.status(200).json({
    totalLogins,
    seekerLogins,
    geekLogins,
    failedLogins: 0,
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

module.exports = { getLoginSummary, getSeekerLoginsOverTime, getGeekLoginsOverTime };
