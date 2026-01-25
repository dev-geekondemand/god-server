const express = require('express');
const { getUserIssues, getAllIssues } = require('../controllers/userIssueController');
const { authenticateJWT } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/get-issue', authenticateJWT, getUserIssues);
router.get('/', getAllIssues);



module.exports = router