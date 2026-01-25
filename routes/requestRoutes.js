const express = require('express');
const { createRequestWithSelectedGeek, getMatchedGeeks,acceptRequest, rejectRequest, getGeekRequests, getSeekerRequests, getRequestById, completeRequest, autoRejectRequest, addReviewBySeeker } =require('../controllers/requestController.js');
const protectGeek = require('../middlewares/protectGeek.js');
const { authenticateMobileJWT } = require('../middlewares/authMiddleware.js');

const router = express.Router();

const { azureUploader, uploadValidator, uploadLimiter } = require("../middlewares/azureUploads.js");

router.put(
  '/:id/complete',
  uploadLimiter,
  azureUploader(
    ['image/jpeg', 'image/png', 'video/mp4'],
    [
      { name: 'images', maxCount: 5 },
      { name: 'video', maxCount: 1 }
    ]
  ),
  uploadValidator,
  protectGeek,
  completeRequest
);


router.post('/:serviceId/pre-request', authenticateMobileJWT,  getMatchedGeeks);
router.post('/create-request', authenticateMobileJWT,  createRequestWithSelectedGeek);
router.get('/geek-requests', protectGeek, getGeekRequests);
router.get('/seeker-requests', authenticateMobileJWT, getSeekerRequests);
router.get('/:id', authenticateMobileJWT, getRequestById);
router.post('/:id/accept', protectGeek, acceptRequest);
router.post('/:id/reject',protectGeek, rejectRequest);
router.put('/:id/auto-reject',autoRejectRequest);
router.put('/:id/add-seeker-review',authenticateMobileJWT, addReviewBySeeker);


module.exports = router;
