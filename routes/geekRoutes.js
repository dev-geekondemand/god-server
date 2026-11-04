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
  verifyOtpAndCreateCorporateGeek,
  adminCreateCorporateGeek,
  getGeekById,
  findGeekById,
  logoutGeek,
  // bulkUploadGeeks,
  updateGeekRateCard,
  sendVerificationEmail,
  verifyEmail,
  getGeeksByBrand,
  getGeeksByRefCode,
  updateGeekAssignments,
  getSsoHandoffToken,
  exchangeSsoToken,
} =require('../controllers/geekController.js')

const {geekBaseSchema, addressSchema} = require('../validators/geekValidators.js')
const validateBody = require('../middlewares/validateBody.js');
const adhaarNumberSchema = require('../validators/adhaarNumberSchema.js');
const { pollAadhaarStatus } = require('../controllers/adhaarVerificationController.js');
const { authenticateGeekJWT, authenticateMobileJWT, protectAdmin } = require('../middlewares/authMiddleware.js');
const {singleUploader, uploadLimiter} = require('../middlewares/azureUploads.js');
const protectGeek  = require('../middlewares/protectGeek.js');
const allowAdminOrSelf = require('../middlewares/allowAdminOrSelf.js');
const { protectMobileGeek } = require('../middlewares/protectMobileGeek.js');
const {Geek} = require('../models/geekModel.js');

const router = express.Router();


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, "geeks.xlsx"),
});
const upload = multer({ storage });

// Route to handle Excel upload and insertion
// router.post(
//   "/bulk-upload",
//   // protectAdmin,
//   upload.single("file"),
//   bulkUploadGeeks
// );

 

const profileImageUploader = singleUploader(['image/jpeg', 'image/png'], 'profileImage');

// Geek profile data is editable only by that geek (any of their active
// sessions) or an admin. Handlers act on the :id in the URL, so a plain
// "some geek is logged in" check (protectGeek) is not enough. Runs before any
// uploader so unauthorised files never reach storage.
const geekSelfOrAdmin = allowAdminOrSelf('Geek');

router.post('/', validateBody(geekBaseSchema), verifyOtpAndCreateGeek);
router.post('/:id/certificates', geekSelfOrAdmin, upload.single('file'), uploadCertificate);
router.delete('/:id/certificates/:certId', geekSelfOrAdmin, deleteCertificate);
router.post('/:id/profile-image',
  geekSelfOrAdmin,
  uploadLimiter,
  profileImageUploader,
  updateProfileImage
);

// routes/geekRoutes.ts
router.put("/:id/rate-card", geekSelfOrAdmin, updateGeekRateCard);


router.post('/send-otp', sendOtpToPhone);
router.post('/geek-login', verifyOtpAndLogin);
router.post('/geek-logout', logoutGeek);
router.get('/sso-handoff', authenticateGeekJWT, getSsoHandoffToken);
router.post('/sso-exchange', exchangeSsoToken);
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
router.post('/:id/rate-card', geekSelfOrAdmin, addRateCard);
router.post('/geek-email-verify',protectGeek, sendVerificationEmail);
router.post('/verify-email/:token',protectGeek, verifyEmail);

router.put('/:id/update-details', geekSelfOrAdmin, updateGeekDetails);
router.put('/:geekId/mobile/update-details', allowAdminOrSelf('Geek', { param: 'geekId' }), updateGeekAssignments);

router.put('/:id/address', geekSelfOrAdmin, updateAddress);


router.delete('/:id/rate-card/:rateId', geekSelfOrAdmin, deleteRateCardItem);

// Availability
router.put('/:id/availability', geekSelfOrAdmin, updateAvailability);

// ─── Corporate Geek Routes ────────────────────────────────────────────────────
// Self-register a corporate geek via OTP (same flow as individual)
router.post('/corporate/register', verifyOtpAndCreateCorporateGeek);
// Admin creates a corporate geek directly without OTP (from admin panel)
router.post('/corporate/admin-create', protectAdmin, adminCreateCorporateGeek);

// Search & Filter
router.post('/geeks-by-refCode',protectAdmin, getGeeksByRefCode);

router.get('/search', searchGeeks);
router.get('/me', authenticateGeekJWT, getGeekById);
router.get('/mobile-me', authenticateMobileJWT, getGeekById);


router.get('/findGeek/:id',findGeekById);
router.get('/:brandId',getGeeksByBrand);

// Delete — admin, or the geek deleting their own account. Nothing else.
router.delete('/:id', allowAdminOrSelf('Geek'), deleteGeek);



//verifyAdhaar

router.put('/verify-adhaar',protectGeek, verifyGeekAadhaar);
router.get('/aadhaar-status/:requestId', protectGeek, pollAadhaarStatus);
module.exports = router; 
