const asyncHandler = require('express-async-handler');
const User = require('../models/seekerModel.js');
const { Geek } = require('../models/geekModel.js');
const ServiceRequest = require('../models/ServiceRequest.js');
const Category = require('../models/serviceCategory.js');

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
 * groupBy: 'month' | 'quarter' | 'year'   (default: month)
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
//   groupBy    : 'month' | 'quarter' | 'year'   (default: month)
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
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.quarter': 1 } },
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
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.quarter': 1 } },
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
// GET /api/admin/dashboard/requests
// Service requests grouped by category, with optional time breakdown.
//
// Query params:
//   groupBy    : 'month' | 'quarter' | 'year'   (default: month)
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
                { k: 'month',   v: '$_id.month' },
                { k: 'quarter', v: '$_id.quarter' },
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
        'period.month': 1,
        'period.quarter': 1,
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

module.exports = {
  getDashboardSummary,
  getSeekersOverTime,
  getGeeksOverTime,
  getRequestsByCategory,
  getRequestsCategorySummary,
};
