const express = require('express');
const { createEnquiry, getAllEnquiries, getEnquiryById, updateEnquiryById, deleteEnquiryById } = require('../controllers/enquiryCtrl.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');
const { enquiryLimiter } = require('../middlewares/rateLimiter.js');

const router = express.Router();

router.post('/', enquiryLimiter, createEnquiry);
// Submitters' names, emails and phones — admin only.
router.get('/', protectAdmin, getAllEnquiries);
router.get('/:id', protectAdmin, getEnquiryById);
router.put('/:id',protectAdmin, updateEnquiryById);
router.delete('/:id',protectAdmin, deleteEnquiryById);

module.exports =  router;