const express = require('express');
const {
  createAd,
  getAllAds,
  getInnerAd,
  getTopAds,
  getAdById,
  updateAd,
  deleteAd,
  trackAdClick,
} = require('../controllers/adController');
const { protectAdmin } = require('../middlewares/authMiddleware');
const { singleUploader, uploadLimiter } = require('../middlewares/azureUploads');

const router = express.Router();

const adImageUploader = singleUploader(
  ['image/jpeg', 'image/png'],
  'adImage'
);

router.post(
  '/',
  protectAdmin,
  uploadLimiter,
  adImageUploader,
  createAd
);

router.get('/', getAllAds);
router.get('/top', getTopAds);
router.get('/inner', getInnerAd);
router.get('/:id/click', trackAdClick);
router.get('/:id', protectAdmin, getAdById);

router.put('/:id', protectAdmin, updateAd);
router.delete('/:id', protectAdmin, deleteAd);

module.exports = router;
