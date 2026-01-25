const express = require('express');
const { getAadhaarVerifications } = require('../controllers/adminAadhaarController');
const { protectAdmin } = require('../middleware/adminMiddleware');

const router = express.Router();

router.get('/', protectAdmin, getAadhaarVerifications);
router.get('/adhaar-status/:requestId', protectAdmin, pollAadhaarStatus);

module.exports = router;
