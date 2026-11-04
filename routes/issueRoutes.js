const express = require('express');
const { getUserIssues, getAllIssues } = require('../controllers/userIssueController');
const { authenticateJWT, protectAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/get-issue', authenticateJWT, getUserIssues);
// Every seeker's issue reports — admin only. A booked geek gets the issue for
// their own request via the request endpoints, not this list.
router.get('/', protectAdmin, getAllIssues);



module.exports = router