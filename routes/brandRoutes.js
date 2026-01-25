const express = require('express');
const { createBrand,uploadBrandImagesFromZip, getBrands, getBrandById, updateBrand, deleteBrand, uploadBrandsExcel, getBrandsByCategory, updateBrandImage } = require('../controllers/brandController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');
const multer = require('multer');
const { uploadLimiter, singleUploader } = require('../middlewares/azureUploads.js');

const router = express.Router();


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, "brands.xlsx"),
});
const upload = multer({ storage });

router.post('/upload-brands', upload.single('file'), uploadBrandsExcel);
const brandImageUploader = singleUploader(['image/jpeg', 'image/png'], 'brandImage');

router.post('/:id/brand-image', 
  protectAdmin,
  uploadLimiter,
  brandImageUploader,
  updateBrandImage
);

router.post(
  "/upload-brand-images-zip",
  uploadLimiter,
  singleUploader(
    ["application/zip", "application/x-zip-compressed"],
    "zip" // ⬅️ Postman key MUST be "zip"
  ),
  uploadBrandImagesFromZip
);




router.post('/', protectAdmin, createBrand);
router.get('/', getBrands);
router.get('/:id', getBrandById);
router.get('/get-by-category/:categoryId', getBrandsByCategory);
router.put('/:id',protectAdmin, updateBrand);
router.delete('/:id',protectAdmin, deleteBrand);

module.exports =  router;