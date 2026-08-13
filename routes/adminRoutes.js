const express = require('express');

const { loginAdmin, registerAdmin, loadAdmin, getAllAdmins } = require('../controllers/adminController.js');
const {
  getDashboardSummary,
  getSeekersOverTime,
  getGeeksOverTime,
  getRequestsByCategory,
  getRequestsCategorySummary,
  getGeeksSecondarySkills,
  getGeeksPrimarySkills,
} = require('../controllers/dashboardController.js');
const {
  getLoginSummary,
  getSeekerLoginsOverTime,
  getGeekLoginsOverTime,
  getUserLoginsList,
} = require('../controllers/loginanalyticsController.js');
const {
  getProfileAuditSummary,
  getProfileAuditList,
  getUserProfileHistory,
  archiveProfileAuditLogs,
  exportProfileAuditLogsCsv,
} = require('../controllers/profileAuditController.js');
const {
  getAllRequestsAdmin,
  getHiringRequestsAdmin,
  getRejectedRequestsAdmin,
  getRequestById,
} = require('../controllers/requestController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');

const router = express.Router();

// Auth
router.post('/admin-login', loginAdmin);
router.post('/register', registerAdmin);
router.get('/load-admin', protectAdmin, loadAdmin);
router.get('/all', protectAdmin, getAllAdmins);

// Dashboard analytics (all protected)
router.get('/dashboard/summary',             protectAdmin, getDashboardSummary);
router.get('/dashboard/seekers',             protectAdmin, getSeekersOverTime);
router.get('/dashboard/geeks',               protectAdmin, getGeeksOverTime);
router.get('/dashboard/requests',            protectAdmin, getRequestsByCategory);
router.get('/dashboard/requests/summary',    protectAdmin, getRequestsCategorySummary);
router.get('/dashboard/geeks/secondary-skills', protectAdmin, getGeeksSecondarySkills);
router.get('/dashboard/geeks/primary-skills',   protectAdmin, getGeeksPrimarySkills);

// Login analytics (all protected)
router.get('/loginanalytics/summary', protectAdmin, getLoginSummary);
router.get('/loginanalytics/seekers', protectAdmin, getSeekerLoginsOverTime);
router.get('/loginanalytics/geeks',   protectAdmin, getGeekLoginsOverTime);
router.get('/loginanalytics/list',    protectAdmin, getUserLoginsList);

// Profile audit trail (all protected)
router.get('/profileaudit/summary',      protectAdmin, getProfileAuditSummary);
router.get('/profileaudit/list',         protectAdmin, getProfileAuditList);
router.get('/profileaudit/user/:userId', protectAdmin, getUserProfileHistory);
router.post('/profileaudit/archive',     protectAdmin, archiveProfileAuditLogs);
router.get('/profileaudit/export',       protectAdmin, exportProfileAuditLogsCsv);

// Request reports (admin)
router.get('/requests',          protectAdmin, getAllRequestsAdmin);
router.get('/requests/hiring',   protectAdmin, getHiringRequestsAdmin);
router.get('/requests/rejected', protectAdmin, getRejectedRequestsAdmin);
router.get('/requests/:id',      protectAdmin, getRequestById);

module.exports = router;