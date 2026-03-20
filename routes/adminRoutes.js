const express = require('express');

const { loginAdmin, registerAdmin, loadAdmin } = require('../controllers/adminController.js');
const {
  getDashboardSummary,
  getSeekersOverTime,
  getGeeksOverTime,
  getRequestsByCategory,
  getRequestsCategorySummary,
} = require('../controllers/dashboardController.js');
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

module.exports = router;