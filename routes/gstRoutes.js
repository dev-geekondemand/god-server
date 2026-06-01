const express = require('express');
const { getGstCaptcha, verifyGstinFormat, verifyGstinPortal } = require('../controllers/gstController.js');

const router = express.Router();

router.get('/captcha', getGstCaptcha);
router.get('/verify', verifyGstinFormat);
router.post('/verify', verifyGstinPortal);

module.exports = router;
