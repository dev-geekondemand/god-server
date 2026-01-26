const express = require('express');
const multer = require('multer');

const {
  uploadCertificate,
  deleteCertificate,
  updateProfileImage,
  addRateCard,
  deleteRateCardItem,
  updateAvailability,
  updateGeekDetails,
  searchGeeks,
  deleteGeek,
  updateAddress,
  verifyGeekAadhaar,
  sendOtpToPhone,
  verifyOtpAndLogin,
  verifyOtpAndCreateGeek,
  getGeekById,
  findGeekById,
  logoutGeek,
  bulkUploadGeeks,
  updateGeekRateCard,
  sendVerificationEmail,
  verifyEmail,
  getGeeksByBrand,
  getGeeksByRefCode,
  updateGeekAssignments
} =require('../controllers/geekController.js')

const {geekBaseSchema, addressSchema} = require('../validators/geekValidators.js')
const validateBody = require('../middlewares/validateBody.js');
const adhaarNumberSchema = require('../validators/adhaarNumberSchema.js');
const { pollAadhaarStatus } = require('../controllers/adhaarVerificationController.js');
const { authenticateJWT,authenticateMobileJWT, protectAdmin } = require('../middlewares/authMiddleware.js');
const {singleUploader, uploadLimiter} = require('../middlewares/azureUploads.js');
const protectGeek  = require('../middlewares/protectGeek.js');
const { protectMobileGeek } = require('../middlewares/protectMobileGeek.js');
const {Geek} = require('../models/geekModel.js');

const router = express.Router();


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, "geeks.xlsx"),
});
const upload = multer({ storage });

// Route to handle Excel upload and insertion
router.post(
  "/bulk-upload",
  // protectAdmin,
  upload.single("file"),
  bulkUploadGeeks
);

 

const profileImageUploader = singleUploader(['image/jpeg', 'image/png'], 'profileImage');

router.post('/', validateBody(geekBaseSchema), verifyOtpAndCreateGeek);
router.post('/:id/certificates', upload.single('file'), uploadCertificate);
router.delete('/:id/certificates/:certId', deleteCertificate);
router.post('/:id/profile-image', 
  uploadLimiter,
  profileImageUploader,
  updateProfileImage
);

// routes/geekRoutes.ts
router.put("/:id/rate-card", protectGeek, updateGeekRateCard);


router.post('/send-otp', sendOtpToPhone);
router.post('/geek-login', verifyOtpAndLogin);
router.post('/geek-logout', logoutGeek);
router.post('/push-token', protectMobileGeek, async (req, res) => {
  const { geekId, token } = req.body;
  if (!geekId || !token) {
    return res.status(400).json({ message: 'geekId and token required' });
  }

  try {
    await Geek.findByIdAndUpdate(geekId, { expoPushToken: token });
    return res.json({ success: true });
  } catch (err) {
    console.error('Error saving push token:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
// Rate Card
router.post('/:id/rate-card', protectGeek, addRateCard);
router.post('/geek-email-verify',protectGeek, sendVerificationEmail);
router.post('/verify-email/:token',protectGeek, verifyEmail);

router.put('/:id/update-details',  updateGeekDetails);
router.put('/:geekId/mobile/update-details',  updateGeekAssignments);

router.put('/:id/address', protectGeek, updateAddress);


router.delete('/:id/rate-card/:rateId', deleteRateCardItem);

// Availability
router.put('/:id/availability', protectGeek, updateAvailability);

// Search & Filter
router.post('/geeks-by-refCode',protectAdmin, getGeeksByRefCode);

router.get('/search', searchGeeks);
router.get('/me', authenticateJWT, getGeekById);
router.get('/mobile-me', authenticateMobileJWT, getGeekById);


router.get('/findGeek/:id',findGeekById);
router.get('/:brandId',getGeeksByBrand);

// Delete
router.delete('/:id', deleteGeek);



//verifyAdhaar

router.put('/verify-adhaar',protectGeek, verifyGeekAadhaar);
router.get('/aadhaar-status/:requestId', protectGeek, pollAadhaarStatus);
module.exports = router; 
