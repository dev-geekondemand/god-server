const express = require('express');
const { createEnquiry, getAllEnquiries, getEnquiryById, updateEnquiryById, deleteEnquiryById } = require('../controllers/enquiryCtrl.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');

const router = express.Router();

router.post('/', createEnquiry);
router.get('/', getAllEnquiries);
router.get('/:id', getEnquiryById);
router.put('/:id',protectAdmin, updateEnquiryById);
router.delete('/:id',protectAdmin, deleteEnquiryById);

module.exports =  router;