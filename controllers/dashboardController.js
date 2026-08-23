const asyncHandler = require('express-async-handler');
const User = require('../models/seekerModel.js');
const { Geek } = require('../models/geekModel.js');
const ServiceRequest = require('../models/ServiceRequest.js');
const Category = require('../models/serviceCategory.js');
const AuditLog = require('../models/auditLogModel.js');
const { generateSasUrl } = require('../utils/azureBlob.js');

/**
 * Build a date range match stage from query params.
 * Supports:
 *   - startDate / endDate  (ISO strings)
 *   - year                 (e.g. 2024 → full year)
 * Defaults to current year if nothing is supplied.
 */
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

/**
 * Build the $group _id expression based on groupBy param.
 * groupBy: 'day' | 'month' | 'quarter' | 'year'   (default: month)
 */
const buildGroupId = (groupBy, dateField = '$createdAt') => {
  switch (groupBy) {
    case 'year':
      return { year: { $year: dateField } };

    case 'quarter':
      return {
        year: { $year: dateField },
        quarter: {
          $ceil: { $divide: [{ $month: dateField }, 3] },
        },
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

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/summary
// Quick totals: seekers, geeks, requests, categories
// ---------------------------------------------------------------------------
const getDashboardSummary = asyncHandler(async (req, res) => {
  const [
    totalSeekers,
    totalGeeks,
    totalRequests,
    totalCategories,
    requestsByStatus,
  ] = await Promise.all([
    User.countDocuments(),
    Geek.countDocuments(),
    ServiceRequest.countDocuments(),
    Category.countDocuments(),
    ServiceRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const statusMap = {};
  requestsByStatus.forEach(({ _id, count }) => {
    statusMap[_id] = count;
  });

  res.status(200).json({
    totalSeekers,
    totalGeeks,
    totalRequests,
    totalCategories,
    requestsByStatus: statusMap,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/seekers
// Seekers registered over time, grouped by month / quarter / year
//
// Query params:
//   groupBy    : 'day' | 'month' | 'quarter' | 'year'   (default: month)
//   startDate  : ISO date string
//   endDate    : ISO date string
//   year       : e.g. 2024  (used when startDate/endDate are absent)
// ---------------------------------------------------------------------------
const getSeekersOverTime = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const groupBy = req.query.groupBy || 'month';
  const groupId = buildGroupId(groupBy);

  const data = await User.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.quarter': 1, '_id.month': 1, '_id.day': 1 } },
    {
      $project: {
        _id: 0,
        period: '$_id',
        count: 1,
      },
    },
  ]);

  res.status(200).json({
    groupBy,
    range: { from: start, to: end },
    total: data.reduce((sum, d) => sum + d.count, 0),
    data,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/geeks
// Geeks registered over time, grouped by month / quarter / year
//
// Same query params as /seekers
// ---------------------------------------------------------------------------
const getGeeksOverTime = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const groupBy = req.query.groupBy || 'month';
  const groupId = buildGroupId(groupBy);

  const data = await Geek.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.quarter': 1, '_id.month': 1, '_id.day': 1 } },
    {
      $project: {
        _id: 0,
        period: '$_id',
        count: 1,
      },
    },
  ]);

  res.status(200).json({
    groupBy,
    range: { from: start, to: end },
    total: data.reduce((sum, d) => sum + d.count, 0),
    data,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/revenue
// Subscription revenue over time, grouped by day / month / quarter / year.
// Sourced from AuditLog 'payment_success' (gross) and 'refund_issued' (refunded)
// entries, since Subscription documents don't retain a historical amount —
// only the latest payment. Entries logged before this endpoint existed won't
// carry metadata.amount and are simply excluded (revenue is accurate from the
// day this shipped forward, not retroactively).
//
// Same query params as /seekers and /geeks.
// ---------------------------------------------------------------------------
const getRevenueOverTime = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const groupBy = req.query.groupBy || 'month';
  const groupId = buildGroupId(groupBy);

  const [grossData, refundedData] = await Promise.all([
    AuditLog.aggregate([
      {
        $match: {
          action: 'payment_success',
          createdAt: { $gte: start, $lte: end },
          'metadata.amount': { $exists: true },
        },
      },
      { $group: { _id: groupId, amount: { $sum: '$metadata.amount' }, count: { $sum: 1 } } },
    ]),
    AuditLog.aggregate([
      {
        $match: {
          action: 'refund_issued',
          createdAt: { $gte: start, $lte: end },
          'metadata.amount': { $exists: true },
        },
      },
      { $group: { _id: groupId, amount: { $sum: '$metadata.amount' } } },
    ]),
  ]);

  const byPeriod = new Map();
  const keyOf = (id) => JSON.stringify(id);

  grossData.forEach(({ _id, amount, count }) => {
    byPeriod.set(keyOf(_id), { period: _id, grossPaise: amount, refundedPaise: 0, count });
  });
  refundedData.forEach(({ _id, amount }) => {
    const key = keyOf(_id);
    const existing = byPeriod.get(key);
    if (existing) {
      existing.refundedPaise = amount;
    } else {
      byPeriod.set(key, { period: _id, grossPaise: 0, refundedPaise: amount, count: 0 });
    }
  });

  const data = Array.from(byPeriod.values())
    .map((d) => ({ ...d, netPaise: d.grossPaise - d.refundedPaise }))
    .sort((a, b) => {
      const A = a.period, B = b.period;
      return (A.year - B.year) || ((A.quarter || 0) - (B.quarter || 0)) || ((A.month || 0) - (B.month || 0)) || ((A.day || 0) - (B.day || 0));
    });

  const totals = data.reduce(
    (acc, d) => ({
      totalGrossPaise: acc.totalGrossPaise + d.grossPaise,
      totalRefundedPaise: acc.totalRefundedPaise + d.refundedPaise,
      totalNetPaise: acc.totalNetPaise + d.netPaise,
    }),
    { totalGrossPaise: 0, totalRefundedPaise: 0, totalNetPaise: 0 }
  );

  res.status(200).json({
    groupBy,
    range: { from: start, to: end },
    ...totals,
    data,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/requests/funnel
// A current-status distribution of requests raised in the given range, shaped
// as a sequential funnel (Raised -> Matched -> Accepted -> Completed).
//
// IMPORTANT: ServiceRequest has a single `status` field and no per-stage
// timestamps (no matchedAt/acceptedAt/completedAt), so this reflects each
// request's CURRENT status, not a true stage-transition history. Rejected and
// Cancelled are reported separately as "dropped" rather than folded into the
// sequential stages, since they're exits, not stages.
//
// Query params: startDate / endDate / year (same as buildDateRange elsewhere
// in this file). No groupBy — this is a single-range summary.
// ---------------------------------------------------------------------------
const getRequestFunnel = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);

  const byStatus = await ServiceRequest.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const statusMap = {};
  byStatus.forEach(({ _id, count }) => { statusMap[_id] = count; });

  const raised    = Object.values(statusMap).reduce((a, b) => a + b, 0);
  const matched   = (statusMap.Matched ?? 0) + (statusMap.Accepted ?? 0) + (statusMap.Completed ?? 0);
  const accepted  = (statusMap.Accepted ?? 0) + (statusMap.Completed ?? 0);
  const completed = statusMap.Completed ?? 0;

  res.status(200).json({
    range: { from: start, to: end },
    stages: [
      { label: 'Raised', count: raised },
      { label: 'Matched', count: matched },
      { label: 'Accepted', count: accepted },
      { label: 'Completed', count: completed },
    ],
    dropped: { rejected: statusMap.Rejected ?? 0, cancelled: statusMap.Cancelled ?? 0 },
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/geeks/top
// Ranked list of Geeks by number of completed requests in the given range.
//
// IMPORTANT: ranked by completed-request COUNT, not rating — the platform's
// rating data is split across three inconsistent mechanisms (an embedded
// Geek.reviews[] array, a standalone Review model linked via ServiceRequest,
// and a geek.totalRating field that's written to in requestController.js but
// isn't actually declared on GeekSchema). Completed-request count is the one
// clean, unambiguous signal available.
//
// Query params: startDate / endDate / year (buildDateRange), limit (default 5, max 20).
// ---------------------------------------------------------------------------
const getTopGeeks = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const limit = Math.min(20, parseInt(req.query.limit) || 5);

  const top = await ServiceRequest.aggregate([
    { $match: { status: 'Completed', updatedAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$geek', completedCount: { $sum: 1 } } },
    { $sort: { completedCount: -1 } },
    { $limit: limit },
    { $lookup: { from: 'geeks', localField: '_id', foreignField: '_id', as: 'geek' } },
    { $unwind: '$geek' },
  ]);

  const geeks = await Promise.all(top.map(async (t) => {
    let profileImageUrl = null;
    if (t.geek.profileImage?.public_id) {
      try {
        profileImageUrl = await generateSasUrl(t.geek.profileImage.public_id);
      } catch (err) {
        console.error(`[getTopGeeks] SAS URL failed for geek ${t.geek._id}:`, err.message);
      }
    }
    return {
      geekId: t.geek._id,
      fullName: t.geek.fullName,
      profileImageUrl,
      subscriptionPlan: t.geek.subscriptionPlan,
      completedCount: t.completedCount,
    };
  }));

  res.status(200).json({ range: { from: start, to: end }, geeks });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/requests
// Service requests grouped by category, with optional time breakdown.
//
// Query params:
//   groupBy    : 'day' | 'month' | 'quarter' | 'year'   (default: month)
//   startDate  : ISO date string
//   endDate    : ISO date string
//   year       : e.g. 2024
//   categoryId : ObjectId — filter to a single category
// ---------------------------------------------------------------------------
const getRequestsByCategory = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);
  const groupBy   = req.query.groupBy || 'month';
  const groupId   = buildGroupId(groupBy);

  const matchStage = { createdAt: { $gte: start, $lte: end } };
  if (req.query.categoryId) {
    const mongoose = require('mongoose');
    matchStage.category = new mongoose.Types.ObjectId(req.query.categoryId);
  }

  const data = await ServiceRequest.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          category: '$category',
          ...groupId,
        },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id.category',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id.category',
        categoryTitle: { $ifNull: ['$categoryInfo.title', 'Unknown'] },
        period: {
          $arrayToObject: {
            $filter: {
              input: [
                { k: 'year',    v: '$_id.year' },
                { k: 'quarter', v: '$_id.quarter' },
                { k: 'month',   v: '$_id.month' },
                { k: 'day',     v: '$_id.day' },
              ],
              as: 'item',
              cond: { $gt: ['$$item.v', null] },
            },
          },
        },
        count: 1,
      },
    },
    {
      $sort: {
        categoryTitle: 1,
        'period.year': 1,
        'period.quarter': 1,
        'period.month': 1,
        'period.day': 1,
      },
    },
  ]);

  // Reshape: { [categoryTitle]: { total, periods: [...] } }
  const grouped = {};
  data.forEach(({ categoryId, categoryTitle, period, count }) => {
    if (!grouped[categoryTitle]) {
      grouped[categoryTitle] = { categoryId, categoryTitle, total: 0, periods: [] };
    }
    grouped[categoryTitle].total += count;
    grouped[categoryTitle].periods.push({ period, count });
  });

  res.status(200).json({
    groupBy,
    range: { from: start, to: end },
    categories: Object.values(grouped),
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/requests/summary
// Total requests per category (no time breakdown) — useful for pie charts
// ---------------------------------------------------------------------------
const getRequestsCategorySummary = asyncHandler(async (req, res) => {
  const { start, end } = buildDateRange(req.query);

  const data = await ServiceRequest.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        categoryTitle: { $ifNull: ['$categoryInfo.title', 'Unknown'] },
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    range: { from: start, to: end },
    total: data.reduce((sum, d) => sum + d.count, 0),
    categories: data,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/geeks/secondary-skills
// Count how many geeks list each category as a secondary skill
// ---------------------------------------------------------------------------
const getGeeksSecondarySkills = asyncHandler(async (req, res) => {
  const data = await Geek.aggregate([
    { $match: { secondarySkills: { $exists: true, $not: { $size: 0 } } } },
    { $unwind: '$secondarySkills' },
    { $group: { _id: '$secondarySkills', count: { $sum: 1 } } },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        categoryTitle: { $ifNull: ['$categoryInfo.title', 'Unknown'] },
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    total: data.reduce((sum, d) => sum + d.count, 0),
    skills: data,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/geeks/primary-skills
// Count how many geeks have each category as their primary skill
// ---------------------------------------------------------------------------
const getGeeksPrimarySkills = asyncHandler(async (req, res) => {
  const data = await Geek.aggregate([
    { $match: { primarySkill: { $exists: true, $ne: null } } },
    { $group: { _id: '$primarySkill', count: { $sum: 1 } } },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        categoryTitle: { $ifNull: ['$categoryInfo.title', 'Unknown'] },
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    total: data.reduce((sum, d) => sum + d.count, 0),
    skills: data,
  });
});

module.exports = {
  getDashboardSummary,
  getSeekersOverTime,
  getGeeksOverTime,
  getRevenueOverTime,
  getRequestFunnel,
  getTopGeeks,
  getRequestsByCategory,
  getRequestsCategorySummary,
  getGeeksSecondarySkills,
  getGeeksPrimarySkills,
};
