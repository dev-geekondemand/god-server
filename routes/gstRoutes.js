const express = require('express');
const { getCaptcha, verifyGstin } = require('../controllers/gstController');

const router = express.Router();

router.get('/captcha', getCaptcha);
router.post('/verify', verifyGstin);

module.exports = router;
