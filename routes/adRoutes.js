const express = require('express');
const { createAd, getAds, getAdById, updateAd, deleteAd, getInnerAd, getTopAds } = require('../controllers/adController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');
const { singleUploader, uploadLimiter } = require('../middlewares/azureUploads.js');

const router = express.Router();

const adImageUploader = singleUploader(['image/jpeg', 'image/png'], 'adImage');
router.post('/ad-image', 
    protectAdmin,
    uploadLimiter,
    adImageUploader,
    createAd
);
// router.get('/', getAds);
router.get('/inner-ads', getInnerAd);
router.get('/top-ads', getTopAds);
// router.get('/:id', getAdById);
router.put('/:id',protectAdmin, updateAd);
router.delete('/:id',protectAdmin, deleteAd);

module.exports =  router;