const express = require('express');

const { loginAdmin, registerAdmin, loadAdmin } = require('../controllers/adminController.js');
const {
  getDashboardSummary,
  getSeekersOverTime,
  getGeeksOverTime,
  getRequestsByCategory,
  getRequestsCategorySummary,
  getGeeksSecondarySkills,
} = require('../controllers/dashboardController.js');
const {
  getLoginSummary,
  getSeekerLoginsOverTime,
  getGeekLoginsOverTime,
} = require('../controllers/loginanalyticsController.js');
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

// Dashboard analytics (all protected)
router.get('/dashboard/summary',             protectAdmin, getDashboardSummary);
router.get('/dashboard/seekers',             protectAdmin, getSeekersOverTime);
router.get('/dashboard/geeks',               protectAdmin, getGeeksOverTime);
router.get('/dashboard/requests',            protectAdmin, getRequestsByCategory);
router.get('/dashboard/requests/summary',    protectAdmin, getRequestsCategorySummary);
router.get('/dashboard/geeks/secondary-skills', protectAdmin, getGeeksSecondarySkills);

// Login analytics (all protected)
router.get('/loginanalytics/summary', protectAdmin, getLoginSummary);
router.get('/loginanalytics/seekers', protectAdmin, getSeekerLoginsOverTime);
router.get('/loginanalytics/geeks',   protectAdmin, getGeekLoginsOverTime);

// Request reports (admin)
router.get('/requests',          protectAdmin, getAllRequestsAdmin);
router.get('/requests/hiring',   protectAdmin, getHiringRequestsAdmin);
router.get('/requests/rejected', protectAdmin, getRejectedRequestsAdmin);
router.get('/requests/:id',      protectAdmin, getRequestById);

module.exports = router;